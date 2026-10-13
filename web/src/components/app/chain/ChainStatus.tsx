"use client";

import { Button } from "@/components/ui";
import { chainSetup } from "@/lib/chain/config";
import { useAppStore } from "@/lib/store";
import { Notice } from "../primitives";

/**
 * Says what is going on with the connection: a configuration problem (so a
 * missing variable is not a silent fallback), a chain that cannot be read, and
 * the way back to the mock demo.
 */
export function ChainStatus() {
  const source = useAppStore((s) => s.source);
  const chain = useAppStore((s) => s.chain);
  const switchToMock = useAppStore((s) => s.switchToMock);

  if (chainSetup.mode === "mock" && chainSetup.reason === "incomplete") {
    return (
      <div className="mb-6">
        <Notice title="Chain mode was requested, but the configuration is incomplete">
          <p>Showing the mock demo instead. Fix these environment variables:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {chainSetup.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      </div>
    );
  }

  if (source !== "chain" || !chain) return null;

  if (chain.status === "loading") {
    return (
      <p role="status" className="mb-6 font-mono text-xs text-ink-3">
        Reading {chain.name}...
      </p>
    );
  }

  if (chain.status === "error") {
    return (
      <div className="mb-6">
        <Notice title={`Cannot read ${chain.name}`}>
          <p>{chain.error}</p>
          <p className="mt-2">
            Check that the node is running and the addresses in <code>web/.env.local</code> match
            the deployment (<code>npm run deploy:anvil</code> writes them).
          </p>
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={switchToMock}>
              Use mock demo data instead
            </Button>
          </div>
        </Notice>
      </div>
    );
  }

  return null;
}
