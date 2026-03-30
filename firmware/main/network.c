/**
 * @file network.c
 * @brief Wi-Fi + SNTP + HTTPS POST implementation
 */

#include "network.h"
#include "config.h"

#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "cJSON.h"
#include <string.h>
#include <time.h>

static const char *TAG = "network";

/* ── Wi-Fi event group bits ──────────────────────────────────────────── */
#define WIFI_CONNECTED_BIT  BIT0
#define WIFI_FAIL_BIT       BIT1

static EventGroupHandle_t s_wifi_eg = NULL;
static int                s_retry_count = 0;

/* ── Wi-Fi event handler ─────────────────────────────────────────────── */

static void wifi_event_handler(void *arg, esp_event_base_t base,
                               int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_count < WIFI_MAX_RETRY) {
            esp_wifi_connect();
            s_retry_count++;
            ESP_LOGW(TAG, "Wi-Fi retry %d/%d", s_retry_count, WIFI_MAX_RETRY);
        } else {
            xEventGroupSetBits(s_wifi_eg, WIFI_FAIL_BIT);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *ev = (ip_event_got_ip_t *)data;
        ESP_LOGI(TAG, "IP: " IPSTR, IP2STR(&ev->ip_info.ip));
        s_retry_count = 0;
        xEventGroupSetBits(s_wifi_eg, WIFI_CONNECTED_BIT);
    }
}

/* ── network_wifi_connect ────────────────────────────────────────────── */

esp_err_t network_wifi_connect(void)
{
    s_wifi_eg = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t h_any, h_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL, &h_any));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL, &h_ip));

    wifi_config_t wifi_cfg = {
        .sta = {
            .ssid     = WIFI_SSID,
            .password = WIFI_PASSWORD,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());

    EventBits_t bits = xEventGroupWaitBits(s_wifi_eg,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE,
                                           portMAX_DELAY);

    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "Connected to SSID: %s", WIFI_SSID);
        return ESP_OK;
    }

    ESP_LOGE(TAG, "Failed to connect to Wi-Fi");
    return ESP_FAIL;
}

/* ── network_sntp_sync ───────────────────────────────────────────────── */

esp_err_t network_sntp_sync(void)
{
    ESP_LOGI(TAG, "Synchronising time via SNTP (IST = UTC+5:30)...");
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, SNTP_SERVER_0);   /* in.pool.ntp.org  */
    esp_sntp_setservername(1, SNTP_SERVER_1);   /* time.google.com  */
    esp_sntp_setservername(2, SNTP_SERVER_2);   /* pool.ntp.org     */
    esp_sntp_init();

    uint32_t elapsed = 0;
    while (sntp_get_sync_status() == SNTP_SYNC_STATUS_RESET) {
        vTaskDelay(pdMS_TO_TICKS(500));
        elapsed += 500;
        if (elapsed >= SNTP_SYNC_TIMEOUT_MS) {
            ESP_LOGE(TAG, "SNTP sync timed out");
            return ESP_ERR_TIMEOUT;
        }
    }

    /* UTC epoch */
    time_t utc_now = 0;
    time(&utc_now);

    /* Convert to IST (UTC + 5 h 30 min) for display */
    time_t ist_now = utc_now + IST_OFFSET_SECS;
    struct tm ist_tm;
    gmtime_r(&ist_now, &ist_tm);

    ESP_LOGI(TAG, "SNTP synced  UTC epoch : %lld", (long long)utc_now);
    ESP_LOGI(TAG, "SNTP synced  IST (GMT+5:30) : %04d-%02d-%02d %02d:%02d:%02d",
             ist_tm.tm_year + 1900, ist_tm.tm_mon + 1, ist_tm.tm_mday,
             ist_tm.tm_hour, ist_tm.tm_min, ist_tm.tm_sec);

    return ESP_OK;
}

/* ── HTTP event handler (silent) ─────────────────────────────────────── */

static esp_err_t http_event_handler(esp_http_client_event_t *evt)
{
    (void)evt;
    return ESP_OK;
}

/* ── network_post_entropy ────────────────────────────────────────────── */

esp_err_t network_post_entropy(uint64_t    timestamp,
                               const char *hash_hex,
                               const char *sig_hex,
                               const char *pubkey_hex,
                               const char *rtc_time,
                               const char *aes_cipher_hex,
                               const char *aes_iv_hex,
                               const char *image_enc_hex,
                               const char *image_iv_hex,
                               const char *image_hash_hex)
{
    /* Build JSON body */
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "device_id",    DEVICE_ID);
    cJSON_AddNumberToObject(root, "timestamp",    (double)timestamp);
    cJSON_AddStringToObject(root, "entropy_hash", hash_hex);
    cJSON_AddStringToObject(root, "signature",    sig_hex);
    if (pubkey_hex) {
        cJSON_AddStringToObject(root, "public_key", pubkey_hex);
    }
    if (rtc_time) {
        cJSON_AddStringToObject(root, "rtc_time", rtc_time);
    }
    if (aes_cipher_hex) {
        cJSON_AddStringToObject(root, "aes_ciphertext", aes_cipher_hex);
    }
    if (aes_iv_hex) {
        cJSON_AddStringToObject(root, "aes_iv", aes_iv_hex);
    }
    if (image_enc_hex) {
        cJSON_AddStringToObject(root, "image_encrypted", image_enc_hex);
    }
    if (image_iv_hex) {
        cJSON_AddStringToObject(root, "image_iv", image_iv_hex);
    }
    if (image_hash_hex) {
        cJSON_AddStringToObject(root, "image_hash", image_hash_hex);
    }
    char *body = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!body) { ESP_LOGE(TAG, "cJSON_PrintUnformatted failed"); return ESP_FAIL; }

    /* Build full URL */
    char url[256];
    snprintf(url, sizeof(url), "%s%s", BACKEND_HOST, BACKEND_ENTROPY_PATH);

    esp_http_client_config_t cfg = {
        .url             = url,
        .method          = HTTP_METHOD_POST,
        .timeout_ms      = HTTP_TIMEOUT_MS,
        .event_handler   = http_event_handler,
        .transport_type  = HTTP_TRANSPORT_OVER_TCP,  /* plain HTTP for local Docker */
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, body, (int)strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    int status   = esp_http_client_get_status_code(client);

    esp_http_client_cleanup(client);
    free(body);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "HTTP perform failed: %s", esp_err_to_name(err));
        return err;
    }

    if (status < 200 || status >= 300) {
        ESP_LOGE(TAG, "Backend returned HTTP %d", status);
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Payload sent, HTTP %d", status);
    return ESP_OK;
}

/* ── network_wifi_disconnect ─────────────────────────────────────────── */

esp_err_t network_wifi_disconnect(void)
{
    esp_err_t ret = esp_wifi_stop();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "esp_wifi_stop failed: %s", esp_err_to_name(ret));
    } else {
        ESP_LOGI(TAG, "Wi-Fi stopped");
    }
    return ret;
}
