// src/domain/result.ts
//
// Resultado genérico do domínio: sucesso com valor ou falha com DomainError.
// Tipo puro, sem I/O.

import type { DomainError } from "./bracket/types";

export type Result<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: DomainError };
