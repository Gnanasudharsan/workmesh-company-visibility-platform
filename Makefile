SHELL := /bin/bash
PNPM := corepack pnpm
COMPOSE := docker compose --env-file .env

.PHONY: docs-check loadtest help setup env install up down dev seed migrate test test-core test-api test-web lint typecheck build e2e screenshots demo clean-db logs

help: ## List available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

env:
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")

install:
	$(PNPM) install

setup: env install up migrate seed ## One-time setup: env file, deps, containers, schema, demo data
	@echo "Setup complete. Run 'make dev' and open http://localhost:3002"

up: env ## Start PostgreSQL and Redis containers
	$(COMPOSE) up -d --wait

down: ## Stop containers (data volumes are kept)
	$(COMPOSE) down

logs: ## Tail container logs
	$(COMPOSE) logs -f --tail=100

migrate: ## Apply database migrations
	$(PNPM) --filter @workmesh/api exec prisma migrate deploy

seed: ## Load the synthetic demo companies (Northstar Labs + Meridian Systems)
	$(PNPM) --filter @workmesh/core build
	$(PNPM) --filter @workmesh/api run seed

dev: up ## Run core watcher, API (8020) and web (3002) in development mode
	$(PNPM) --filter @workmesh/core build
	$(PNPM) --parallel --filter @workmesh/core --filter @workmesh/api --filter @workmesh/web run dev

test: test-core test-api test-web ## Run all unit + integration tests

test-core:
	$(PNPM) --filter @workmesh/core test

test-api: up
	$(PNPM) --filter @workmesh/core build
	$(PNPM) --filter @workmesh/api run test

test-web:
	$(PNPM) --filter @workmesh/web test

lint: ## Lint all packages
	$(PNPM) --filter @workmesh/core build
	$(PNPM) -r run lint

typecheck: ## Type-check all packages
	$(PNPM) --filter @workmesh/core build
	$(PNPM) -r run typecheck

build: ## Production build of all packages
	$(PNPM) -r --workspace-concurrency=1 run build

e2e: up ## Run Playwright critical-journey tests against a freshly seeded stack
	$(PNPM) --filter @workmesh/web run e2e

screenshots: up ## Capture real application screenshots into docs/screenshots
	$(PNPM) --filter @workmesh/web run screenshots

demo: setup ## Set up everything and start the app with demo data
	@echo "Demo credentials are in .demo-credentials.json (git-ignored)."
	$(MAKE) dev

clean-db: ## Drop and recreate the local database (destroys local data)
	$(PNPM) --filter @workmesh/api exec prisma migrate reset --force --skip-seed

docs-check: ## Validate every Mermaid diagram in README.md and docs/
	node scripts/validate-mermaid.mjs

loadtest: ## Measure API latency against a running, seeded API
	$(PNPM) --filter @workmesh/api run loadtest
