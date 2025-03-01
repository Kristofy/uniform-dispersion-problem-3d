CC = clang++
CFLAGS = --target=wasm32 -nostdlib -O3
LDFLAGS = --no-entry --export-all --lto-O3 --allow-undefined --import-memory
OBJ = /tmp/inc.o
SRC = main.cpp
OUT = main.wasm

$(OUT): $(OBJ)
	wasm-ld $(LDFLAGS) $(OBJ) -o $(OUT)

$(OBJ): $(SRC)
	$(CC) $(CFLAGS) -o $(OBJ) -c $(SRC)
