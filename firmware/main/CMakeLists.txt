idf_component_register(
    SRCS
        "main.c"
        "uart.c"
        "crypto.c"
        "rtc.c"
        "utils.c"
    INCLUDE_DIRS "."
    REQUIRES
        mbedtls
        driver
        json
)
