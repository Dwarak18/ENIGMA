idf_component_register(
    SRCS "Enigma_pro.c" "crypto.c" "rtc.c" "entropy.c"
         "rtc.c"
         "entropy.c"
         "crypto.c"
    INCLUDE_DIRS "."
    REQUIRES mbedtls driver

)
