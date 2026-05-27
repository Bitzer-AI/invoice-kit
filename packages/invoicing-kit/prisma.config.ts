import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "tests/fixtures/prisma",
  datasource: {
    url: env("INVOICING_KIT_TEST_DATABASE_URL"),
  },
});
