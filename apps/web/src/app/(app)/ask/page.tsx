"use client";

import { AskMesh } from "@/components/copilot/ask-mesh";
import { PageHeader } from "@/components/ui/card";

export default function AskPage() {
  return (
    <>
      <PageHeader
        eyebrow="Optional AI layer"
        title="Ask the Mesh"
        description="Ask about the company in plain words. Every answer comes from WorkMesh records, with links to its sources."
      />
      <AskMesh />
    </>
  );
}
