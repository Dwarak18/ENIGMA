#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "rtc.h"
#include "entropy.h"
#include "crypto.h"

void app_main(void)
{
    char time_str[20];
    char payload[100];
    char hash_output[65];

    external_rtc_init();
    entropy_init();

    while (1) {

        rtc_get_time(time_str);
        uint32_t entropy = entropy_generate();

        sprintf(payload, "%s-%lu", time_str, entropy);

        generate_hash(payload, hash_output);

        printf("\n============================\n");
        printf("Time     : %s\n", time_str);
        printf("Entropy  : %lu\n", entropy);
        printf("Payload  : %s\n", payload);
        printf("SHA256   : %s\n", hash_output);
        printf("============================\n");

        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}
