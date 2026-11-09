"use client";

import { useState } from "react";
import type { Comment } from "@/lib/types";
import { relative } from "@/lib/utils";
import { PersonChip } from "../ui/avatar";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Textarea } from "../ui/form";

export function Comments({ comments, onSubmit, pending }: { comments: Comment[]; onSubmit: (body: string) => void; pending: boolean }) {
  const [body, setBody] = useState("");
  return (
    <Card>
      <CardHeader title={`Comments (${comments.length})`} description="Visible to everyone who can see this record." />
      <CardBody className="space-y-4">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <PersonChip person={c.author} sub={relative(c.createdAt)} size="xs" />
            <p className="flex-1 whitespace-pre-line rounded-lg bg-subtle/70 px-3 py-2 text-[13px]">{c.body}</p>
          </div>
        ))}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) {
              onSubmit(body.trim());
              setBody("");
            }
          }}
        >
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ask a clarifying question or offer help…" aria-label="Comment" />
          <Button type="submit" variant="primary" className="sm:self-end" disabled={!body.trim()} loading={pending}>Comment</Button>
        </form>
      </CardBody>
    </Card>
  );
}
