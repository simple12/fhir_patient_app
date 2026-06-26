import fs from "fs";

export type FhirConfig = {
  baseUrl: string;
  accessToken: string;
};

const DEFAULT_BASE_URL = "http://localhost:8082/fhir";

function resolveConfigPath(): string | undefined {
  const configured = process.env.FHIR_CONFIG_PATH?.trim();
  return configured || undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function readConfigFile(configPath: string): Partial<FhirConfig> | undefined {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      baseUrl?: string;
      accessToken?: string;
    };

    return {
      baseUrl:
        typeof parsed.baseUrl === "string" ? normalizeBaseUrl(parsed.baseUrl) : undefined,
      accessToken:
        typeof parsed.accessToken === "string" ? parsed.accessToken.trim() : undefined,
    };
  } catch {
    return undefined;
  }
}

/** Read FHIR target on each call so a mounted config file can be updated without restart. */
export function getFhirConfig(): FhirConfig {
  const fromFile = (() => {
    const configPath = resolveConfigPath();
    return configPath ? readConfigFile(configPath) : undefined;
  })();

  const baseUrl =
    fromFile?.baseUrl ||
    process.env.FHIR_BASE_URL?.trim() ||
    DEFAULT_BASE_URL;

  const accessToken =
    fromFile?.accessToken ?? process.env.FHIR_ACCESS_TOKEN?.trim() ?? "";

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    accessToken,
  };
}
