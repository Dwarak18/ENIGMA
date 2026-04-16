/**
 * @file websocket_client.c
 * @brief WebSocket client implementation using esp_websocket_client
 *
 * Features:
 *   - Non-blocking async WebSocket with FreeRTOS
 *   - Exponential backoff reconnection
 *   - Binary frame support for encrypted chunk data
 *   - OTA-safe pause/resume mechanism
 *   - Queue-based chunking pipeline
 */

#include "websocket_client.h"
#include "config.h"
#include "esp_websocket_client.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_event.h"
#include "cJSON.h"

#include <string.h>
#include <stdio.h>

static const char *TAG = "ws_client";

/* ── Configuration ─────────────────────────────────────────────────── */
#define WS_QUEUE_SIZE           32
#define WS_TASK_STACK_SIZE      4096
#define WS_TASK_PRIORITY        5
#define WS_MAX_RECONNECT_DELAY  30000  /* 30 seconds */
#define WS_INITIAL_BACKOFF      1000   /* 1 second */

/* ── Internal state ──────────────────────────────────────────────────– */
typedef struct {
    esp_websocket_client_handle_t client;
    websocket_state_t state;
    bool paused;
    
    /* Reconnection backoff */
    uint32_t backoff_ms;
    uint32_t reconnect_attempts;
    
    /* Queue for image chunks */
    QueueHandle_t chunk_queue;
    
    /* Callbacks */
    websocket_on_connect_t on_connect;
    websocket_on_disconnect_t on_disconnect;
    websocket_on_message_t on_message;
    void *user_data;
} websocket_ctx_t;

static websocket_ctx_t s_ctx = {
    .client = NULL,
    .state = WS_DISCONNECTED,
    .paused = false,
    .backoff_ms = WS_INITIAL_BACKOFF,
    .reconnect_attempts = 0,
    .chunk_queue = NULL,
    .on_connect = NULL,
    .on_disconnect = NULL,
    .on_message = NULL,
    .user_data = NULL,
};

/* ── Forward declarations ────────────────────────────────────────────– */
static void websocket_event_handler(void *handler_args, esp_event_base_t base,
                                    int32_t event_id, void *event_data);
static void websocket_task(void *pvParameters);

/* ── State management ────────────────────────────────────────────────– */

static void websocket_set_state(websocket_state_t state) {
    if (s_ctx.state == state) return;
    websocket_state_t prev = s_ctx.state;
    s_ctx.state = state;
    ESP_LOGI(TAG, "State: %d → %d", prev, state);
}

/* ── Reconnection logic ──────────────────────────────────────────────– */

static void websocket_exponential_backoff(void) {
    s_ctx.backoff_ms = (s_ctx.backoff_ms * 2 > WS_MAX_RECONNECT_DELAY)
                       ? WS_MAX_RECONNECT_DELAY
                       : s_ctx.backoff_ms * 2;
    s_ctx.reconnect_attempts++;
    ESP_LOGW(TAG, "Reconnect attempt %u, backoff %u ms",
             s_ctx.reconnect_attempts, s_ctx.backoff_ms);
}

static void websocket_reset_backoff(void) {
    s_ctx.backoff_ms = WS_INITIAL_BACKOFF;
    s_ctx.reconnect_attempts = 0;
}

/* ── Event handlers ─────────────────────────────────────────────────– */

static void websocket_event_handler(void *handler_args, esp_event_base_t base,
                                    int32_t event_id, void *event_data)
{
    (void)handler_args;
    
    if (base != WEBSOCKET_CLIENT_EVENT) return;
    
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;
    
    switch ((esp_websocket_client_event_t)event_id) {
        
        case WEBSOCKET_CLIENT_EVENT_CONNECTED:
            ESP_LOGI(TAG, "WebSocket connected");
            websocket_set_state(WS_CONNECTED);
            websocket_reset_backoff();
            if (s_ctx.on_connect) {
                s_ctx.on_connect(s_ctx.user_data);
            }
            break;
            
        case WEBSOCKET_CLIENT_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "WebSocket disconnected");
            websocket_set_state(WS_DISCONNECTED);
            if (s_ctx.on_disconnect) {
                const char *reason = (const char *)data->data_ptr ?: "normal close";
                s_ctx.on_disconnect(reason, s_ctx.user_data);
            }
            break;
            
        case WEBSOCKET_CLIENT_EVENT_DATA:
            if (data->op_code == 0x1 || data->op_code == 0x2) {  /* text or binary */
                if (s_ctx.on_message) {
                    s_ctx.on_message(data->data_ptr, data->data_len, s_ctx.user_data);
                }
            }
            break;
            
        case WEBSOCKET_CLIENT_EVENT_ERROR:
            ESP_LOGE(TAG, "WebSocket error");
            websocket_set_state(WS_ERROR);
            if (s_ctx.on_disconnect) {
                s_ctx.on_disconnect("error", s_ctx.user_data);
            }
            break;
            
        default:
            break;
    }
}

/* ── Chunk transmission ──────────────────────────────────────────────– */

static void websocket_send_queued_chunk(const websocket_chunk_t *chunk) {
    if (!chunk || !s_ctx.client) return;
    if (s_ctx.state != WS_CONNECTED || s_ctx.paused) return;
    
    /* Build JSON header */
    cJSON *json = cJSON_CreateObject();
    cJSON_AddStringToObject(json, "type", "image:chunk");
    cJSON_AddStringToObject(json, "device_id", chunk->device_id);
    cJSON_AddNumberToObject(json, "timestamp", chunk->timestamp);
    cJSON_AddNumberToObject(json, "chunk_id", chunk->chunk_id);
    cJSON_AddNumberToObject(json, "total_chunks", chunk->total_chunks);
    cJSON_AddStringToObject(json, "hash", chunk->hash);
    
    /* Encode IV as hex */
    char iv_hex[33];
    for (int i = 0; i < 16; i++) {
        sprintf(&iv_hex[i * 2], "%02x", chunk->iv[i]);
    }
    iv_hex[32] = '\0';
    cJSON_AddStringToObject(json, "iv", iv_hex);
    
    /* Encode encrypted data as hex */
    char *data_hex = malloc(chunk->encrypted_data_len * 2 + 1);
    if (data_hex) {
        for (size_t i = 0; i < chunk->encrypted_data_len; i++) {
            sprintf(&data_hex[i * 2], "%02x", chunk->encrypted_data[i]);
        }
        data_hex[chunk->encrypted_data_len * 2] = '\0';
        cJSON_AddStringToObject(json, "data", data_hex);
    }
    
    char *json_str = cJSON_PrintUnformatted(json);
    if (json_str) {
        esp_err_t ret = esp_websocket_client_send_text(s_ctx.client, json_str, strlen(json_str));
        if (ret == ESP_OK) {
            ESP_LOGD(TAG, "Sent chunk %u/%u (hash: %.8s...)",
                     chunk->chunk_id, chunk->total_chunks, chunk->hash);
        } else {
            ESP_LOGW(TAG, "Failed to send chunk: %s", esp_err_to_name(ret));
        }
        free(json_str);
    }
    
    if (data_hex) free(data_hex);
    cJSON_Delete(json);
}

/* ── WebSocket task ─────────────────────────────────────────────────– */

static void websocket_task(void *pvParameters)
{
    (void)pvParameters;
    websocket_chunk_t chunk;
    esp_err_t ret;
    
    ESP_LOGI(TAG, "WebSocket task started");
    
    for (;;) {
        /* Try to receive chunk from queue with timeout */
        if (xQueueReceive(s_ctx.chunk_queue, &chunk, pdMS_TO_TICKS(100))) {
            websocket_send_queued_chunk(&chunk);
        }
        
        /* Reconnection logic */
        if (s_ctx.state == WS_DISCONNECTED && !s_ctx.paused) {
            if (s_ctx.client == NULL) {
                /* Initial connection attempt */
                websocket_set_state(WS_CONNECTING);
                esp_websocket_client_config_t ws_cfg = {
                    .uri = BACKEND_WEBSOCKET_URI,
                    .buffer_size = 4096,
                    .reconnect_timeout_ms = s_ctx.backoff_ms,
                };
                s_ctx.client = esp_websocket_client_init(&ws_cfg);
                if (s_ctx.client) {
                    esp_websocket_register_events(s_ctx.client, WEBSOCKET_CLIENT_EVENT,
                                                 websocket_event_handler, NULL);
                    ret = esp_websocket_client_start(s_ctx.client);
                    if (ret != ESP_OK) {
                        ESP_LOGE(TAG, "Failed to start WebSocket: %s", esp_err_to_name(ret));
                        websocket_exponential_backoff();
                        websocket_set_state(WS_RECONNECTING);
                    }
                } else {
                    ESP_LOGE(TAG, "Failed to init WebSocket client");
                    websocket_exponential_backoff();
                    websocket_set_state(WS_RECONNECTING);
                }
            } else if (s_ctx.state == WS_RECONNECTING) {
                /* Backoff wait before reconnect */
                vTaskDelay(pdMS_TO_TICKS(s_ctx.backoff_ms));
                websocket_exponential_backoff();
            }
        }
    }
}

/* ── Public API ──────────────────────────────────────────────────────– */

esp_err_t websocket_init(void) {
    return websocket_init_with_callbacks(
        BACKEND_WEBSOCKET_URI,
        NULL, NULL, NULL, NULL
    );
}

esp_err_t websocket_init_with_callbacks(
    const char *host,
    websocket_on_connect_t on_connect,
    websocket_on_disconnect_t on_disconnect,
    websocket_on_message_t on_message,
    void *user_data)
{
    (void)host;  /* Host will be used when creating client in task */
    
    if (s_ctx.chunk_queue != NULL) {
        ESP_LOGW(TAG, "WebSocket already initialized");
        return ESP_ERR_INVALID_STATE;
    }
    
    s_ctx.chunk_queue = xQueueCreate(WS_QUEUE_SIZE, sizeof(websocket_chunk_t));
    if (!s_ctx.chunk_queue) {
        ESP_LOGE(TAG, "Failed to create chunk queue");
        return ESP_ERR_NO_MEM;
    }
    
    s_ctx.on_connect = on_connect;
    s_ctx.on_disconnect = on_disconnect;
    s_ctx.on_message = on_message;
    s_ctx.user_data = user_data;
    
    if (xTaskCreate(websocket_task, "ws_task", WS_TASK_STACK_SIZE,
                    NULL, WS_TASK_PRIORITY, NULL) != pdPASS) {
        ESP_LOGE(TAG, "Failed to create WebSocket task");
        vQueueDelete(s_ctx.chunk_queue);
        s_ctx.chunk_queue = NULL;
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "WebSocket initialized");
    return ESP_OK;
}

websocket_state_t websocket_get_state(void) {
    return s_ctx.state;
}

bool websocket_is_ready(void) {
    return (s_ctx.state == WS_CONNECTED) && !s_ctx.paused;
}

void websocket_pause(void) {
    ESP_LOGI(TAG, "WebSocket paused (OTA in progress)");
    s_ctx.paused = true;
    websocket_set_state(WS_OTA_PAUSED);
}

void websocket_resume(void) {
    ESP_LOGI(TAG, "WebSocket resumed after OTA");
    s_ctx.paused = false;
    if (s_ctx.state == WS_OTA_PAUSED) {
        websocket_set_state(WS_DISCONNECTED);  /* Trigger reconnect */
    }
}

esp_err_t websocket_send_image_chunk(const websocket_chunk_t *chunk) {
    if (!chunk || !s_ctx.chunk_queue) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (!websocket_is_ready()) {
        ESP_LOGD(TAG, "WebSocket not ready, dropping chunk");
        return ESP_FAIL;
    }
    
    if (xQueueSend(s_ctx.chunk_queue, chunk, pdMS_TO_TICKS(100)) == pdTRUE) {
        return ESP_OK;
    } else {
        ESP_LOGW(TAG, "Chunk queue full, dropping chunk");
        return ESP_FAIL;
    }
}
