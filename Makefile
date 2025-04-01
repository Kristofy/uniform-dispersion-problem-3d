CC = clang++
CFLAGS = --target=wasm32 -nostdlib -O3
LDFLAGS = --no-entry --export-all --lto-O3 --allow-undefined --import-memory

TSC = npx tsc

WASM_DIR=src/wasm
OUT_DIR=dist
OBJ_DIR=$(OUT_DIR)/obj

OUT_WASM = $(OUT_DIR)/main.wasm
SRC_WASM = $(shell ls $(WASM_DIR) | grep .cpp)
OBJ_WASM = $(patsubst %.cpp,$(OBJ_DIR)/%.o,$(SRC_WASM))

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

$(OBJ_DIR)/%.o: $(WASM_DIR)/%.cpp $(OBJ_DIR)
	$(CC) $(CFLAGS) -o $@ -c $<
########## WASM END ########## 


########## TS START ########## 
$(OUT_JS): $(OUT_DIR) $(SRC_TS) node_modules
	$(TSC)
########## TS END ########## 


########## STATIC START ########## 
$(OUT_STATIC): $(OUT_DIR) $(SRC_STATIC)
	cp -r $(SRC_STATIC_DIR)/* $(OUT_DIR)
########## STATIC END ########## 

clean:
	rm -rf $(OUT_DIR)

run: all
	python3 -m http.server --directory $(OUT_DIR)

.PHONY: all clean run
