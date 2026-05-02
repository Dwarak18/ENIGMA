idf_component_register(
    SRCS
        "main.c"
        "uart.c"
        "crypto.c"
        "wifi.c"
        "ntp.c"
        "utils.c"
    INCLUDE_DIRS "."
    REQUIRES
        mbedtls
        driver
        json
        esp_wifi
        nvs_flash
        esp_netif
        lwip
)
