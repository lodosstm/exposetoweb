REPORTER = spec

unit:
	@./node_modules/.bin/mocha \
		--reporter $(REPORTER) \
		--ui bdd \
		./test/*.unit.js

e2e:
	@./node_modules/.bin/mocha \
		--reporter $(REPORTER) \
		--ui bdd \
		--bail \
		./test/*.e2e.js

all: unit e2e

.PHONY: all