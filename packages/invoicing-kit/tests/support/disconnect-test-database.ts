import { afterAll } from "vitest";
import { disconnectTestDatabase } from "./test-database";

afterAll(disconnectTestDatabase);
