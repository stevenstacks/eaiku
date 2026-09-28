#!/usr/bin/env node
// Global entry for `eaiku`. Loads tsx from this package so it works from any folder.
import { register } from "tsx/esm/api";

register();
await import("../src/main.ts");
