import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "../contexts/AccountContext";

export function useKeyboardShortcuts() {
  const queryClient = useQueryClient();
  const { accounts, setSelectedAccountId } = useAccounts();
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (isInput) return;

      switch (e.key.toLowerCase()) {
        case "r":
          e.preventDefault();
          queryClient.invalidateQueries();
          break;

        case "escape":
          setShowHelp(false);
          break;

        case "?":
          e.preventDefault();
          setShowHelp((prev) => !prev);
          break;

        case "/":
          e.preventDefault();
          document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
          break;

        default:
          if (e.key >= "1" && e.key <= "9") {
            const idx = parseInt(e.key) - 1;
            if (idx < accounts.length) {
              e.preventDefault();
              setSelectedAccountId(accounts[idx]!.id);
            }
          } else if (e.key === "0") {
            e.preventDefault();
            setSelectedAccountId(null);
          }
      }
    },
    [queryClient, accounts, setSelectedAccountId]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp };
}

export const SHORTCUTS = [
  { key: "R", description: "Refresh all data" },
  { key: "0", description: "Switch to All Accounts" },
  { key: "1-9", description: "Switch to account by index" },
  { key: "/", description: "Focus search input" },
  { key: "?", description: "Toggle shortcuts help" },
  { key: "Esc", description: "Close dialogs" },
];
