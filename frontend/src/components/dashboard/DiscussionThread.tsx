"use client";

import { useMemo, useState } from "react";

import { DiscussionMessageCard } from "@/components/dashboard/DiscussionMessageCard";
import type { CommunityDiscussion, CommunityMessage } from "@/types/community";

type DiscussionThreadProps = {
  discussion: CommunityDiscussion;
  messages: CommunityMessage[];
};

export function DiscussionThread({ discussion, messages }: DiscussionThreadProps) {
  const [replyText, setReplyText] = useState("");
  const [localReplies, setLocalReplies] = useState<CommunityMessage[]>([]);

  const threadMessages = useMemo(
    () => [...messages, ...localReplies],
    [localReplies, messages],
  );

  function addMockReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedReply = replyText.trim();

    if (!trimmedReply) {
      return;
    }

    setLocalReplies((current) => [
      ...current,
      {
        createdAt: "Just now",
        discussionId: discussion.id,
        id: `local-reply-${current.length + 1}`,
        language: discussion.language,
        message: trimmedReply,
        technicianName: "Mock Technician",
        technicianRole: "Technician reply preview",
      },
    ]);
    setReplyText("");
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
          Technician thread
        </p>
        <h2 className="mt-1 text-2xl font-bold text-white">
          {threadMessages.length} message{threadMessages.length === 1 ? "" : "s"}
        </h2>
      </div>

      <div className="space-y-4">
        {threadMessages.map((message) => (
          <DiscussionMessageCard
            isExpertResponse={message.technicianRole.toLowerCase().includes("sealed")}
            isOriginalPoster={message.technicianName === discussion.createdByTechnicianName}
            key={message.id}
            message={message}
          />
        ))}
      </div>

      <form
        className="rounded-lg border border-white/10 bg-slate-900 p-5"
        onSubmit={addMockReply}
      >
        <label className="block">
          <span className="text-sm font-bold text-slate-100">Add Technician Reply</span>
          <textarea
            className="mt-3 w-full resize-y rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
            onChange={(event) => setReplyText(event.target.value)}
            placeholder="Add a private technician-only troubleshooting reply..."
            rows={4}
            value={replyText}
          />
        </label>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-400">
            Local-only mock reply. It disappears on refresh and is not saved or sent.
          </p>
          <button
            className="rounded-md bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
            type="submit"
          >
            Add Mock Reply
          </button>
        </div>
      </form>
    </section>
  );
}
