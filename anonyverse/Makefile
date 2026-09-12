.PHONY: build-ios
build-ios:
	npx react-native run-ios --udid $(filter-out $@,$(MAKECMDGOALS))

# Swallows the UDID so Make doesn't also try (and fail) to build it as a
# target in its own right — `make build-ios 123` treats "123" as a second
# goal unless something claims it.
%:
	@:
