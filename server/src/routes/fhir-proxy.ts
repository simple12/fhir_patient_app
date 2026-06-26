import { Router, type Request, type Response } from "express";
import { getFhirConfig } from "../config/fhir-config.js";

const router = Router();

function buildTargetUrl(req: Request): string {
  const { baseUrl: base } = getFhirConfig();
  const targetPath = req.path || "/";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => {
        if (typeof v === "string") params.append(key, v);
      });
    }
  }
  const query = params.toString();
  return `${base}${targetPath}${query ? `?${query}` : ""}`;
}

function buildHeaders(req: Request): Headers {
  const headers = new Headers();
  const contentType = req.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  headers.set("Accept", req.get("accept") || "application/fhir+json");

  const { accessToken: token } = getFhirConfig();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

async function proxyRequest(req: Request, res: Response): Promise<void> {
  try {
    const targetUrl = buildTargetUrl(req);
    const headers = buildHeaders(req);

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
      init.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, init);
    const body = await response.text();

    const responseContentType = response.headers.get("content-type");
    if (responseContentType) {
      res.setHeader("Content-Type", responseContentType);
    }

    res.status(response.status).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy request failed";
    res.status(502).json({
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", diagnostics: message }],
    });
  }
}

router.all("/*", proxyRequest);

export default router;
