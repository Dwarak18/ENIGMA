idf_component_register(
    SRCS
        "main.c"
        "entropy.c"
        "crypto.c"
        "network.c"
        "storage.c"
    INCLUDE_DIRS "."
    REQUIRES
        nvs_flash
        esp_wifi
        esp_http_client
        mbedtls
        esp_timer
        esp_random
        json
        app_update
)
