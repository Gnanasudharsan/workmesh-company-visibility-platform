"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------- Dialog --------------------------------- */

export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md" }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/45 backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content
          className={cn("fixed left-1/2 top-[6vh] z-50 flex max-h-[88vh] w-[calc(100vw-24px)] -translate-x-1/2 flex-col rounded-2xl border border-line bg-surface shadow-overlay animate-pop focus:outline-none", width)}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-[15px] font-semibold">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">Dialog</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-subtle/40 px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Right-side drawer for inspecting an entity without leaving the page. */
export function Sheet({ open, onOpenChange, title, description, children, width = "max-w-[440px]" }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; width?: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/30 animate-fade-in" />
        <DialogPrimitive.Content className={cn("fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-overlay animate-slide-in focus:outline-none", width)}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-[15px] font-semibold">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className={description ? "mt-0.5 text-[13px] text-muted" : "sr-only"}>{description ?? "Details panel"}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Close panel">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------- Dropdown menu ------------------------------ */

export const DropdownMenu = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <Menu.Portal>
      <Menu.Content align={align} sideOffset={6} className={cn("z-50 min-w-[200px] rounded-xl border border-line bg-surface p-1 shadow-raised animate-pop", className)}>
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownItem({ children, onSelect, icon, danger, disabled }: { children: ReactNode; onSelect?: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <Menu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-subtle",
        danger ? "text-danger" : "text-ink",
      )}
    >
      {icon && <span className="text-muted">{icon}</span>}
      {children}
    </Menu.Item>
  );
}

export const DropdownLabel = ({ children }: { children: ReactNode }) => <Menu.Label className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{children}</Menu.Label>;
export const DropdownSeparator = () => <Menu.Separator className="my-1 h-px bg-line" />;

/* ----------------------------------- Tabs ---------------------------------- */

export function Tabs({ value, onValueChange, tabs, children, className }: { value: string; onValueChange: (v: string) => void; tabs: Array<{ value: string; label: ReactNode; count?: number }>; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 pb-2.5 pt-1 text-[13px] font-medium text-muted transition-colors hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink"
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-subtle px-1.5 text-[11px] tabular-nums text-muted">{t.count}</span>}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}
export const TabPanel = ({ value, children }: { value: string; children: ReactNode }) => (
  <TabsPrimitive.Content value={value} className="focus:outline-none animate-fade-in">
    {children}
  </TabsPrimitive.Content>
);

/* ---------------------------------- Tooltip --------------------------------- */

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-lg bg-ink px-2.5 py-1.5 text-[12px] text-white shadow-raised animate-fade-in">
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
