#include <stdint.h>

extern "C" void console_log(uint32_t value);
extern uint8_t memory;

extern "C" int addone(int a) {
  return a + 1;
}
