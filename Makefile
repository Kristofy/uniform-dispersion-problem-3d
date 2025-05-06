
CC = clang++
CFLAGS = --target=wasm32 -nostdlib -O3
LDFLAGS = --no-entry --export-all --lto-O3 --allow-undefined --import-memory

# Native compilation for tests
NATIVE_CC = $(CC)
NATIVE_CFLAGS = -O2 -g -std=c++17
TEST_WASM_DIR = src/wasm
TEST_OUT_DIR = test_out
TEST_BIN = $(TEST_OUT_DIR)/test_runner
TEST_SRC = $(TEST_WASM_DIR)/test.cpp
TEST_OBJ = $(TEST_OUT_DIR)/test.o

# Define WASM_BUILD and NATIVE_BUILD flags
WASM_DEFINE = -DNO_STD_LIB
NATIVE_DEFINE = 

TSC = npx tsc

WASM_DIR=src/wasm
OUT_DIR=dist
OBJ_DIR=$(OUT_DIR)/obj

OUT_WASM = $(OUT_DIR)/main.wasm
SRC_WASM = $(shell ls $(WASM_DIR) | grep .cpp | grep -v test.cpp | grep -v cli.cpp)
OBJ_WASM = $(patsubst %.cpp,$(OBJ_DIR)/%.o,$(SRC_WASM))

# Header files that are used in the WASM code
WASM_HEADERS = $(WASM_DIR)/maps.h

OUT_JS = $(OUT_DIR)/app.js
SRC_TS = $(shell find src/ts -name "*.ts")

SRC_STATIC_DIR = src/static
SRC_STATIC = $(shell find $(SRC_STATIC_DIR) -type f)
OUT_STATIC = $(patsubst $(SRC_STATIC_DIR)/%,$(OUT_DIR)/%,$(SRC_STATIC))

NODE_MODULES_DIR = node_modules
THREE_DIR = $(NODE_MODULES_DIR)/three
THREE_MODULES = $(OUT_DIR)/node_modules/three

TARGET = $(OUT_WASM) $(OUT_STATIC) $(THREE_MODULES)

all: node_modules $(TARGET) $(OUT_JS)

########## FOLDER START ########## 
$(OUT_DIR):
	mkdir -p $(OUT_DIR)

$(OBJ_DIR):
	mkdir -p $(OBJ_DIR)

$(TEST_OUT_DIR):
	mkdir -p $(TEST_OUT_DIR)

$(OUT_DIR)/node_modules/three:
	mkdir -p $(OUT_DIR)/node_modules/three
	cp -r $(THREE_DIR)/build $(OUT_DIR)/node_modules/three/
	cp -r $(THREE_DIR)/examples $(OUT_DIR)/node_modules/three/
########## FOLDER END ########## 
 
########## DEPENDENCIES START ##########
node_modules:
	npm install
########## DEPENDENCIES END ##########

########## WASM START ########## 
$(OUT_WASM): $(OBJ_WASM) 
	wasm-ld $(LDFLAGS) $(OBJ_WASM) -o $(OUT_WASM)

# Add maps.h as a dependency for main.cpp object files
$(OBJ_DIR)/main.o: $(WASM_DIR)/main.cpp $(WASM_HEADERS) $(OBJ_DIR)
	$(CC) $(CFLAGS) $(WASM_DEFINE) -o $@ -c $<

# General rule for other cpp files
$(OBJ_DIR)/%.o: $(WASM_DIR)/%.cpp $(OBJ_DIR)
	$(CC) $(CFLAGS) $(WASM_DEFINE) -o $@ -c $<
########## WASM END ########## 


########## TS START ########## 
$(OUT_JS): $(OUT_DIR) $(SRC_TS) node_modules
	$(TSC)
########## TS END ########## 


########## STATIC START ########## 
$(OUT_STATIC): $(OUT_DIR) $(SRC_STATIC)
	cp -r $(SRC_STATIC_DIR)/* $(OUT_DIR)
########## STATIC END ########## 

########## TESTS START ##########
$(TEST_BIN): $(TEST_SRC) $(TEST_OUT_DIR)
	$(NATIVE_CC) $(NATIVE_CFLAGS) $(NATIVE_DEFINE) -o $(TEST_BIN) $(TEST_SRC)

test: $(TEST_BIN)
	./$(TEST_BIN)
########## TESTS END ##########

# Native CLI build (Unity build)
CLI_SRC = src/wasm/cli.cpp
CLI_BIN = dist/wasm_cli

$(CLI_BIN): $(CLI_SRC) $(WASM_HEADERS) | $(OUT_DIR)
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ $(CLI_SRC)

cli: $(CLI_BIN)

clean:
	rm -rf $(OUT_DIR) $(TEST_OUT_DIR) $(CLI_BIN)

run: all
	python3 -m http.server --directory $(OUT_DIR)

.PHONY: all clean run test cli
