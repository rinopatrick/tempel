import type { FragmentKey } from "./crypto";

export interface ShareLinkParts {
  id: string;
  key: FragmentKey;
  origin: string;
}

export function buildShareLink({ id, key, origin }: ShareLinkParts): string {
  return `${origin}/s/${id}#${key}`;
}
