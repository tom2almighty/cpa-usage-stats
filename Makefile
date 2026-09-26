.PHONY: all build build-web test clean

PLUGIN_NAME := cpa-usage-stats

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	EXT := dylib
else ifeq ($(OS),Windows_NT)
	EXT := dll
else
	EXT := so
endif

all: build

build-web:
	@echo "==> Building Web Frontend with Bun & Vite..."
	@cd web && bun install && bun run build

build: build-web
	@echo "==> Compiling CGO Shared Library ($(PLUGIN_NAME).$(EXT))..."
	CGO_ENABLED=1 go build -buildmode=c-shared -ldflags="-s -w" -o $(PLUGIN_NAME).$(EXT) .
	@rm -f $(PLUGIN_NAME).h
	@echo "==> Build successful: $(PLUGIN_NAME).$(EXT)"

test:
	@echo "==> Running backend tests..."
	go test -v ./...

clean:
	@rm -f $(PLUGIN_NAME).so $(PLUGIN_NAME).dylib $(PLUGIN_NAME).dll $(PLUGIN_NAME).h
	@rm -rf web/dist
