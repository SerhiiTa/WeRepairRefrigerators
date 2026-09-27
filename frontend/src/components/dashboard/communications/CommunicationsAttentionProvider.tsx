"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ConversationUnreadRow = {
  id: string;
  unread_count: number | null;
};

type CommunicationsAttentionContextValue = {
  unreadCount: number;
};

const CommunicationsAttentionContext =
  createContext<CommunicationsAttentionContextValue>({
    unreadCount: 0,
  });

export function CommunicationsAttentionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [conversationUnreadCounts, setConversationUnreadCounts] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    let isMounted = true;

    async function loadCompanyId() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        return;
      }

      const { data } = await supabase.rpc("current_dashboard_company_id");
      if (!isMounted) {
        return;
      }

      setCompanyId(typeof data === "string" && data ? data : null);
    }

    void loadCompanyId();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!companyId) {
      return;
    }
    const activeCompanyId = companyId;

    let isMounted = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }
    const client = supabase;

    async function loadUnreadCounts() {
      const { data, error } = await client
        .from("communication_conversations")
        .select("id,unread_count")
        .eq("company_id", activeCompanyId)
        .gt("unread_count", 0)
        .limit(1000);

      if (!isMounted || error) {
        return;
      }

      setConversationUnreadCounts(
        Object.fromEntries(
          ((data ?? []) as ConversationUnreadRow[]).map((conversation) => [
            conversation.id,
            Math.max(0, conversation.unread_count ?? 0),
          ]),
        ),
      );
    }

    void loadUnreadCounts();

    const channel = client
      .channel(`communications-attention:${activeCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "communication_conversations",
          filter: `company_id=eq.${activeCompanyId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            setConversationUnreadCounts((current) => {
              const next = { ...current };
              delete next[deletedId];
              return next;
            });
            return;
          }

          const row = payload.new as ConversationUnreadRow;
          setConversationUnreadCounts((current) => {
            const unreadCount = Math.max(0, row.unread_count ?? 0);
            if (unreadCount === 0) {
              const next = { ...current };
              delete next[row.id];
              return next;
            }

            return { ...current, [row.id]: unreadCount };
          });
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void client.removeChannel(channel);
    };
  }, [companyId]);

  const unreadCount = useMemo(
    () =>
      Object.values(conversationUnreadCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    [conversationUnreadCounts],
  );

  const value = useMemo(() => ({ unreadCount }), [unreadCount]);

  return (
    <CommunicationsAttentionContext.Provider value={value}>
      {children}
    </CommunicationsAttentionContext.Provider>
  );
}

export function useCommunicationsAttention() {
  return useContext(CommunicationsAttentionContext);
}
