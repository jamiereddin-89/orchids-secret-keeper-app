"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Eye,
  EyeOff,
  Copy,
  Pencil,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  Search,
  Trash2,
  GripVertical,
  Key,
  Settings,
  FolderKanban,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { SettingsDialog } from "@/components/settings-dialog";
import { getStorageAdapter, StorageAdapter } from "@/lib/storage";

declare const puter: {
  auth: {
    signIn: () => Promise<boolean>;
    signOut: () => Promise<void>;
    isSignedIn: () => boolean;
    getUser: () => Promise<{ username: string; email?: string }>;
  };
  kv: {
    set: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | null>;
    del: (key: string) => Promise<void>;
    list: (pattern?: string, returnValues?: boolean) => Promise<{ key: string; value: string }[]>;
  };
};

interface Secret {
  id: string;
  provider: string;
  secret: string;
  accountName: string;
  order: number;
}

interface ProviderGroup {
  provider: string;
  secrets: Secret[];
  order: number;
}

interface UISettings {
  displayMode: "full" | "compact";
  textSize: "small" | "medium" | "large";
  defaultExpanded: boolean;
}

interface CustomProviderGroup {
  id: string;
  name: string;
  color: string;
  order: number;
}

const defaultUISettings: UISettings = {
  displayMode: "full",
  textSize: "medium",
  defaultExpanded: false,
};

const groupPalette = ["#0EA5E9", "#F97316", "#A855F7", "#10B981", "#F43F5E", "#6366F1"];

const providerDomainOverrides: Record<string, string> = {
  "openai": "openai.com",
  "google": "google.com",
  "google cloud": "cloud.google.com",
  "aws": "aws.amazon.com",
  "amazon web services": "aws.amazon.com",
  "microsoft": "microsoft.com",
  "azure": "azure.microsoft.com",
  "stripe": "stripe.com",
  "github": "github.com",
  "gitlab": "gitlab.com",
  "supabase": "supabase.com",
  "notion": "notion.so",
  "slack": "slack.com",
  "twilio": "twilio.com",
  "firebase": "firebase.google.com",
};

const GROUP_CONFIG_KEY = "provider_group_config";

export default function Home() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [isDark, setIsDark] = useState(true);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [formData, setFormData] = useState({ provider: "", secret: "", accountName: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ type: "secret" | "provider"; id: string; name: string } | null>(null);
  const [providerOrder, setProviderOrder] = useState<string[]>([]);
  const [draggedProvider, setDraggedProvider] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [puterReady, setPuterReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uiSettings, setUISettings] = useState<UISettings>(defaultUISettings);
  const [storage, setStorage] = useState<StorageAdapter | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [customGroups, setCustomGroups] = useState<CustomProviderGroup[]>([]);
  const [providerAssignments, setProviderAssignments] = useState<Record<string, string>>({});
  const [groupConfigLoaded, setGroupConfigLoaded] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [activeGroupFilter, setActiveGroupFilter] = useState("all");
  const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set());

  const orderedCustomGroups = useMemo(() => {
    return [...customGroups].sort((a, b) => a.order - b.order);
  }, [customGroups]);

  const loadUISettings = useCallback(async (adapter: StorageAdapter) => {
    try {
      const saved = await adapter.get("ui_settings");
      if (saved) {
        setUISettings(JSON.parse(saved));
      }
    } catch {
      console.error("Failed to load UI settings");
    }
  }, []);

  const loadGroupConfig = useCallback(async (adapter: StorageAdapter) => {
    try {
      const stored = await adapter.get(GROUP_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setCustomGroups(parsed.groups || []);
        setProviderAssignments(parsed.assignments || {});
      } else {
        setCustomGroups([]);
        setProviderAssignments({});
      }
    } catch {
      console.error("Failed to load provider groups");
    } finally {
      setGroupConfigLoaded(true);
    }
  }, []);

  const loadSecrets = useCallback(async () => {
    if (!storage) return;
    try {
      const items = await storage.list("secret_*", true);
      const loadedSecrets: Secret[] = items.map((item) => JSON.parse(item.value));
      setSecrets(loadedSecrets);
    } catch {
      console.error("Failed to load secrets");
    }
  }, [storage]);

  const loadProviderOrder = useCallback(async () => {
    if (!storage) return;
    try {
      const order = await storage.get("provider_order");
      if (order) {
        setProviderOrder(JSON.parse(order));
      }
    } catch {
      console.error("Failed to load provider order");
    }
  }, [storage]);

  const saveProviderOrder = useCallback(async (order: string[]) => {
    if (!storage) return;
    try {
      await storage.set("provider_order", JSON.stringify(order));
      setProviderOrder(order);
    } catch {
      console.error("Failed to save provider order");
    }
  }, [storage]);

  const groupSecrets = useCallback(() => {
    const groups: Record<string, Secret[]> = {};
    secrets.forEach((secret) => {
      if (!groups[secret.provider]) {
        groups[secret.provider] = [];
      }
      groups[secret.provider].push(secret);
    });

    const providers = Object.keys(groups);
    const orderedProviders = [
      ...providerOrder.filter((provider) => providers.includes(provider)),
      ...providers.filter((provider) => !providerOrder.includes(provider)),
    ];

    const result: ProviderGroup[] = orderedProviders.map((provider, index) => ({
      provider,
      secrets: groups[provider].sort((a, b) => a.order - b.order),
      order: index,
    }));

    setProviderGroups(result);
  }, [secrets, providerOrder]);

  useEffect(() => {
    const checkPuter = setInterval(() => {
      if (typeof puter !== "undefined") {
        setPuterReady(true);
        clearInterval(checkPuter);
      }
    }, 100);

    const failSafe = setTimeout(() => {
      setPuterReady(true);
      clearInterval(checkPuter);
    }, 2000);

    return () => {
      clearInterval(checkPuter);
      clearTimeout(failSafe);
    };
  }, []);

  useEffect(() => {
    if (!puterReady) return;
    const signedIn = typeof puter !== "undefined" && puter.auth.isSignedIn();
    const adapter = getStorageAdapter(signedIn);
    setIsSignedIn(signedIn);
    setStorage(adapter);
    setIsLoading(false);
    loadUISettings(adapter);
    loadGroupConfig(adapter);
  }, [puterReady, loadUISettings, loadGroupConfig]);

  useEffect(() => {
    if (!storage) return;
    loadSecrets();
    loadProviderOrder();
  }, [storage, loadSecrets, loadProviderOrder]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    if (uiSettings.defaultExpanded && providerGroups.length > 0) {
      setExpandedProviders(new Set(providerGroups.map((group) => group.provider)));
    }
  }, [uiSettings.defaultExpanded, providerGroups]);

  useEffect(() => {
    groupSecrets();
  }, [groupSecrets]);

  useEffect(() => {
    if (!storage || !groupConfigLoaded) return;
    storage
      .set(
        GROUP_CONFIG_KEY,
        JSON.stringify({ groups: customGroups, assignments: providerAssignments })
      )
      .catch(() => console.error("Failed to save provider groups"));
  }, [customGroups, providerAssignments, storage, groupConfigLoaded]);

  useEffect(() => {
    setProviderAssignments((prev) => {
      const currentProviders = new Set(secrets.map((secret) => secret.provider));
      const next = { ...prev };
      let changed = false;
      Object.keys(prev).forEach((provider) => {
        if (!currentProviders.has(provider)) {
          delete next[provider];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [secrets]);

  useEffect(() => {
    if (activeGroupFilter === "all" || activeGroupFilter === "ungrouped") return;
    const exists = orderedCustomGroups.some((group) => group.id === activeGroupFilter);
    if (!exists) {
      setActiveGroupFilter("all");
    }
  }, [orderedCustomGroups, activeGroupFilter]);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return providerGroups.filter((group) => {
      const matchesSearch =
        !query ||
        group.provider.toLowerCase().includes(query) ||
        group.secrets.some(
          (secret) =>
            secret.accountName.toLowerCase().includes(query) ||
            secret.secret.toLowerCase().includes(query)
        );

      if (!matchesSearch) return false;

      if (activeGroupFilter === "all") return true;
      if (activeGroupFilter === "ungrouped") {
        return !providerAssignments[group.provider];
      }
      return providerAssignments[group.provider] === activeGroupFilter;
    });
  }, [providerGroups, searchQuery, activeGroupFilter, providerAssignments]);

  const handleSaveSecret = async () => {
    if (!storage) return;
    if (!formData.provider.trim() || !formData.secret.trim()) {
      toast.error("Provider and secret are required");
      return;
    }

    const providerName = formData.provider.trim();
    const accountLabel = formData.accountName.trim() || "Default";
    const id = editingSecret?.id || `secret_${Date.now()}`;
    const newSecret: Secret = {
      id,
      provider: providerName,
      secret: formData.secret.trim(),
      accountName: accountLabel,
      order:
        editingSecret?.order ?? secrets.filter((secret) => secret.provider === providerName).length,
    };

    try {
      await storage.set(id, JSON.stringify(newSecret));
      await loadSecrets();
      setIsAddDialogOpen(false);
      setEditingSecret(null);
      setFormData({ provider: "", secret: "", accountName: "" });
      toast.success(editingSecret ? "Secret updated" : "Secret saved");
    } catch {
      toast.error("Failed to save secret");
    }
  };

  const handleDeleteSecret = async (id: string) => {
    if (!storage) return;
    try {
      await storage.del(id);
      await loadSecrets();
      toast.success("Secret deleted");
    } catch {
      toast.error("Failed to delete secret");
    }
  };

  const handleDeleteProvider = async (provider: string) => {
    if (!storage) return;
    try {
      const toDelete = secrets.filter((secret) => secret.provider === provider);
      for (const secret of toDelete) {
        await storage.del(secret.id);
      }
      const newOrder = providerOrder.filter((item) => item !== provider);
      await saveProviderOrder(newOrder);
      await loadSecrets();
      setProviderAssignments((prev) => {
        if (!prev[provider]) return prev;
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      toast.success(`Deleted all ${provider} secrets`);
    } catch {
      toast.error("Failed to delete provider");
    }
  };

  const handleImportSecrets = async (importedSecrets: Secret[]) => {
    if (!storage) return;
    for (const secret of importedSecrets) {
      await storage.set(secret.id, JSON.stringify(secret));
    }
    await loadSecrets();
  };

  const handleDeleteAllData = async () => {
    if (!storage) throw new Error("Storage not ready");
    try {
      const keySet = new Set(secrets.map((secret) => secret.id));
      if (keySet.size === 0) {
        const listed = await storage.list("secret_*");
        listed.forEach((item) => keySet.add(item.key));
      }
      await Promise.all(Array.from(keySet).map((key) => storage.del(key).catch(() => {})));
      const extras = ["provider_order", "ui_settings", GROUP_CONFIG_KEY];
      await Promise.all(extras.map((key) => storage.del(key).catch(() => {})));
      if (typeof window !== "undefined") {
        const removal: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("secretkeeper_")) {
            removal.push(key);
          }
        }
        removal.forEach((key) => localStorage.removeItem(key));
      }
      setSecrets([]);
      setProviderGroups([]);
      setProviderOrder([]);
      setExpandedProviders(new Set());
      setExpandedAccounts(new Set());
      setRevealedSecrets(new Set());
      setUISettings(defaultUISettings);
      setCustomGroups([]);
      setProviderAssignments({});
      setActiveGroupFilter("all");
      await loadSecrets();
    } catch (error) {
      console.error("Failed to delete all data", error);
      throw error;
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const toggleReveal = (id: string) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
        setExpandedAccounts((accountPrev) => {
          const cleaned = new Set(accountPrev);
          Array.from(cleaned).forEach((key) => {
            if (key.startsWith(`${provider}__`)) {
              cleaned.delete(key);
            }
          });
          return cleaned;
        });
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const toggleAccountSection = (provider: string, account: string) => {
    const key = `${provider}__${account}`;
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openEditDialog = (secret: Secret) => {
    setEditingSecret(secret);
    setFormData({ provider: secret.provider, secret: secret.secret, accountName: secret.accountName });
    setIsAddDialogOpen(true);
  };

  const handleDragStart = (provider: string) => {
    setDraggedProvider(provider);
  };

  const handleDragOver = (event: React.DragEvent, provider: string) => {
    event.preventDefault();
    if (!draggedProvider || draggedProvider === provider) return;
  };

  const handleDrop = async (targetProvider: string) => {
    if (!draggedProvider || draggedProvider === targetProvider) return;

    const currentOrder = providerGroups.map((group) => group.provider);
    const dragIndex = currentOrder.indexOf(draggedProvider);
    const dropIndex = currentOrder.indexOf(targetProvider);

    const newOrder = [...currentOrder];
    newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, draggedProvider);

    await saveProviderOrder(newOrder);
    setDraggedProvider(null);
    toast.success("Order updated");
  };

  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name) {
      toast.error("Enter a group name");
      return;
    }
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `group_${Date.now()}`;
    const color = groupPalette[customGroups.length % groupPalette.length];
    setCustomGroups([...customGroups, { id, name, color, order: customGroups.length }]);
    setNewGroupName("");
  };

  const renameGroup = (id: string, name: string) => {
    setCustomGroups((prev) => prev.map((group) => (group.id === id ? { ...group, name } : group)));
  };

  const removeGroup = (id: string) => {
    setCustomGroups((prev) => prev.filter((group) => group.id !== id));
    setProviderAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((provider) => {
        if (next[provider] === id) {
          delete next[provider];
        }
      });
      return next;
    });
  };

  const handleAssignmentChange = (provider: string, value: string) => {
    setProviderAssignments((prev) => {
      const next = { ...prev };
      if (value === "none") {
        delete next[provider];
      } else {
        next[provider] = value;
      }
      return next;
    });
  };

  const getDomainFromProvider = (provider: string) => {
    const normalized = provider.trim().toLowerCase();
    if (!normalized) return "";
    if (providerDomainOverrides[normalized]) return providerDomainOverrides[normalized];
    const compact = normalized.replace(/[^a-z0-9]/g, "");
    if (!compact) return "";
    return `${compact}.com`;
  };

  const getIconUrl = (provider: string) => {
    const normalized = provider.trim().toLowerCase();
    if (failedIcons.has(normalized)) return "";
    const domain = getDomainFromProvider(provider);
    if (!domain) return "";
    return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;
  };

  const markIconFailed = (provider: string) => {
    const normalized = provider.trim().toLowerCase();
    setFailedIcons((prev) => {
      const next = new Set(prev);
      next.add(normalized);
      return next;
    });
  };

  const providerFilterOptions = useMemo(() => {
    return [
      { id: "all", label: "All Providers" },
      ...orderedCustomGroups.map((group) => ({ id: group.id, label: group.name, color: group.color })),
      { id: "ungrouped", label: "Ungrouped" },
    ];
  }, [orderedCustomGroups]);

  const textSizeClass = {
    small: "text-xs",
    medium: "text-sm",
    large: "text-base",
  }[uiSettings.textSize];

  const compactPadding = uiSettings.displayMode === "compact" ? "p-3" : "p-5";
  const displayName = isSignedIn && username ? username : "Local User";

  if (isLoading || !puterReady) {
    return (
      <div className={`min-h-screen ${isDark ? "bg-slate-950" : "bg-slate-100"} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-800/40 px-8 py-10 bg-slate-900/60">
          <div className="h-12 w-12 rounded-2xl border-4 border-slate-800 border-t-emerald-400 animate-spin" />
          <p className="text-sm text-slate-400">Preparing API Vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
      <Toaster position="top-center" richColors />
      <header className={`sticky top-0 z-50 border-b ${isDark ? "border-slate-800 bg-slate-900/70" : "border-slate-200 bg-white/80"} backdrop-blur-xl`}>
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 gap-4">
          <div className="flex items-center gap-3">
            <div className={`h-11 w-11 rounded-2xl border ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"} flex items-center justify-center`}>
              <Key className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h1 className={`text-lg font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>API Vault - JR</h1>
              <p className="text-xs text-slate-500">Secure provider vault</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`${isDark ? "border-slate-700 text-white" : "border-slate-300 text-slate-700"} px-3 py-1`}>{displayName}</Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDark(!isDark)}
              className={isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSettingsOpen(true)}
              className={isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center">
          <div className="flex-1">
            <div className={`flex items-center gap-2 rounded-2xl border ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"} px-3 py-2`}>
              <Search className={`h-5 w-5 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
              <Input
                placeholder="Search providers, accounts, or keys"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="border-0 bg-transparent text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => {
                setEditingSecret(null);
                setFormData({ provider: "", secret: "", accountName: "" });
                setIsAddDialogOpen(true);
              }}
              className="flex-1 rounded-2xl bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              <Plus className="mr-2 h-4 w-4" /> Add Secret
            </Button>
            <Button
              variant="outline"
              onClick={() => setGroupDialogOpen(true)}
              className={`flex-1 rounded-2xl text-sm font-medium ${isDark ? "border-slate-700 text-white hover:bg-slate-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              <FolderKanban className="mr-2 h-4 w-4" /> Manage Groups
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {providerFilterOptions.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveGroupFilter(filter.id)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeGroupFilter === filter.id
                  ? isDark
                    ? "border-white bg-white text-slate-900"
                    : "border-slate-900 bg-slate-900 text-white"
                  : isDark
                  ? "border-slate-700 text-slate-400 hover:text-white"
                  : "border-slate-200 text-slate-600 hover:text-slate-900"
              }`}
            >
              {filter.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: filter.color }} />}
              {filter.label}
            </button>
          ))}
        </div>

        {filteredGroups.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-slate-300 px-8 py-16 text-center dark:border-slate-700">
            <Key className="h-12 w-12 text-slate-400" />
            <p className="mt-4 text-base font-semibold text-slate-700 dark:text-slate-200">
              {secrets.length === 0 ? "No secrets yet" : "No matches found"}
            </p>
            <p className="text-sm text-slate-500">
              {secrets.length === 0 ? "Use Add Secret to store your first provider" : "Try a different filter or search term"}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filteredGroups.map((group) => {
              const accountBuckets = group.secrets.reduce<Record<string, Secret[]>>((acc, secret) => {
                const key = secret.accountName || "Default";
                if (!acc[key]) acc[key] = [];
                acc[key].push(secret);
                return acc;
              }, {});
              const accountEntries = Object.entries(accountBuckets).sort(([a], [b]) => a.localeCompare(b));
              const providerGroupId = providerAssignments[group.provider];
              const providerGroupMeta = orderedCustomGroups.find((meta) => meta.id === providerGroupId);
              const iconUrl = getIconUrl(group.provider);

              return (
                <div
                  key={group.provider}
                  draggable
                  onDragStart={() => handleDragStart(group.provider)}
                  onDragOver={(event) => handleDragOver(event, group.provider)}
                  onDrop={() => handleDrop(group.provider)}
                  className={`rounded-3xl border ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"} shadow-sm transition-all ${
                    draggedProvider === group.provider ? "opacity-50" : ""
                  }`}
                >
                  <Collapsible open={expandedProviders.has(group.provider)} onOpenChange={() => toggleExpand(group.provider)}>
                    <CollapsibleTrigger asChild>
                      <div className={`${compactPadding} flex w-full items-center justify-between cursor-pointer`}> 
                        <div className="flex items-center gap-4">
                          <GripVertical className={`h-4 w-4 ${isDark ? "text-slate-600" : "text-slate-300"}`} />
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
                            {iconUrl ? (
                              <Image
                                src={iconUrl}
                                alt={`${group.provider} logo`}
                                width={28}
                                height={28}
                                className="rounded-lg"
                                onError={() => markIconFailed(group.provider)}
                              />
                            ) : (
                              <span className="text-sm font-semibold text-emerald-500">
                                {group.provider.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className={`font-semibold ${textSizeClass} ${isDark ? "text-white" : "text-slate-900"}`}>
                                {group.provider}
                              </h3>
                              {providerGroupMeta && (
                                <Badge
                                  variant="outline"
                                  style={{ borderColor: providerGroupMeta.color, color: providerGroupMeta.color }}
                                  className="text-[10px] uppercase"
                                >
                                  {providerGroupMeta.name}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">{group.secrets.length} access key{group.secrets.length !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget({ type: "provider", id: group.provider, name: group.provider });
                            }}
                            className={isDark ? "text-slate-500 hover:text-red-400" : "text-slate-400 hover:text-red-500"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {expandedProviders.has(group.provider) ? (
                            <ChevronDown className={`h-5 w-5 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                          ) : (
                            <ChevronRight className={`h-5 w-5 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className={`border-t ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                        {accountEntries.map(([accountName, secretsForAccount]) => {
                          const accountKey = `${group.provider}__${accountName}`;
                          const isAccountExpanded = expandedAccounts.has(accountKey);
                          return (
                            <div key={accountName} className={`px-5 py-3 ${isDark ? "border-slate-800" : "border-slate-100"} border-b last:border-b-0`}>
                              <button
                                type="button"
                                onClick={() => toggleAccountSection(group.provider, accountName)}
                                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-2 text-left text-sm font-semibold dark:border-slate-800"
                              >
                                <div>
                                  <p className={isDark ? "text-white" : "text-slate-800"}>{accountName}</p>
                                  <p className="text-xs text-slate-500">{secretsForAccount.length} credential{secretsForAccount.length !== 1 ? "s" : ""}</p>
                                </div>
                                {isAccountExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-slate-500" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-slate-500" />
                                )}
                              </button>
                              {isAccountExpanded && (
                                <div className="mt-3 space-y-3">
                                  {secretsForAccount.map((secret) => (
                                    <div
                                      key={secret.id}
                                      className={`rounded-2xl border px-4 py-3 ${isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}
                                    >
                                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <code className={`flex-1 ${textSizeClass} truncate font-mono ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                                          {revealedSecrets.has(secret.id) ? secret.secret : "••••••••••••••••"}
                                        </code>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => toggleReveal(secret.id)}
                                            className={isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}
                                          >
                                            {revealedSecrets.has(secret.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleCopy(secret.secret)}
                                            className={isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(secret)}
                                            className={isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setDeleteTarget({ type: "secret", id: secret.id, name: `${secret.provider} - ${secret.accountName}` })}
                                            className={isDark ? "text-slate-500 hover:text-red-400" : "text-slate-400 hover:text-red-500"}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} max-w-md rounded-3xl`}>
          <DialogHeader>
            <DialogTitle className={isDark ? "text-white" : "text-slate-900"}>{editingSecret ? "Edit Secret" : "Add New Secret"}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">Store provider credentials securely in your vault.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label className={isDark ? "text-slate-200" : "text-slate-700"}>Provider</Label>
              <Input
                placeholder="e.g., OpenAI, Stripe, AWS"
                value={formData.provider}
                onChange={(event) => setFormData({ ...formData, provider: event.target.value })}
                className={`mt-1.5 rounded-2xl ${isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200"}`}
              />
            </div>
            <div>
              <Label className={isDark ? "text-slate-200" : "text-slate-700"}>Secret - API Key/Token</Label>
              <Input
                placeholder="Enter your secret key or token"
                value={formData.secret}
                onChange={(event) => setFormData({ ...formData, secret: event.target.value })}
                className={`mt-1.5 rounded-2xl font-mono ${isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200"}`}
              />
            </div>
            <div>
              <Label className={isDark ? "text-slate-200" : "text-slate-700"}>Account Name</Label>
              <Input
                placeholder="e.g., Production, Personal"
                value={formData.accountName}
                onChange={(event) => setFormData({ ...formData, accountName: event.target.value })}
                className={`mt-1.5 rounded-2xl ${isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200"}`}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                className={`flex-1 rounded-2xl ${isDark ? "border-slate-700 text-white hover:bg-slate-800" : "border-slate-200"}`}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveSecret} className="flex-1 rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600">
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} max-w-2xl rounded-3xl`}>
          <DialogHeader>
            <DialogTitle className={isDark ? "text-white" : "text-slate-900"}>Provider Groups</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">Organize providers into custom collections for faster filtering.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Group name"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                className={`flex-1 rounded-2xl ${isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200"}`}
              />
              <Button onClick={createGroup} className="rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600">
                Add Group
              </Button>
            </div>
            <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
              {orderedCustomGroups.length === 0 ? (
                <p className="text-sm text-slate-500">No groups yet. Create one to start organizing.</p>
              ) : (
                orderedCustomGroups.map((group) => {
                  const assigned = providerGroups
                    .filter((provider) => providerAssignments[provider.provider] === group.id)
                    .map((provider) => provider.provider);
                  return (
                    <div key={group.id} className={`rounded-2xl border ${isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"} p-4`}>
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                        <Input
                          value={group.name}
                          onChange={(event) => renameGroup(group.id, event.target.value)}
                          className={`flex-1 rounded-2xl ${isDark ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeGroup(group.id)}
                          className="text-red-500 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {assigned.length === 0 ? (
                          <p className="text-xs text-slate-500">No providers assigned</p>
                        ) : (
                          assigned.map((provider) => (
                            <Badge key={provider} variant="secondary" className="rounded-full">
                              {provider}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-200">Assign providers</p>
              <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                {providerGroups.length === 0 ? (
                  <p className="text-xs text-slate-500">Add secrets to start assigning providers.</p>
                ) : (
                  providerGroups.map((group) => (
                    <div key={group.provider} className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-center">
                      <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-100">{group.provider}</span>
                      <Select
                        value={providerAssignments[group.provider] || "none"}
                        onValueChange={(value) => handleAssignmentChange(group.provider, value)}
                      >
                        <SelectTrigger className={`w-full rounded-2xl ${isDark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200"}`}>
                          <SelectValue placeholder="Select group" />
                        </SelectTrigger>
                        <SelectContent className={isDark ? "border-slate-700 bg-slate-900 text-white" : "bg-white"}>
                          <SelectItem value="none">No group</SelectItem>
                          {orderedCustomGroups.map((customGroup) => (
                            <SelectItem key={customGroup.id} value={customGroup.id}>
                              {customGroup.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} rounded-3xl`}>
          <AlertDialogHeader>
            <AlertDialogTitle className={isDark ? "text-white" : "text-slate-900"}>
              Delete {deleteTarget?.type === "provider" ? "Provider" : "Secret"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500">
              {deleteTarget?.type === "provider"
                ? `This will delete every credential stored for ${deleteTarget?.name}.`
                : `This will permanently remove ${deleteTarget?.name}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={`rounded-2xl ${isDark ? "border-slate-700 text-white hover:bg-slate-800" : "border-slate-200"}`}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget?.type === "provider") {
                  handleDeleteProvider(deleteTarget.id);
                } else if (deleteTarget) {
                  handleDeleteSecret(deleteTarget.id);
                }
                setDeleteTarget(null);
              }}
              className="rounded-2xl bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        isDark={isDark}
        setIsDark={setIsDark}
        isSignedIn={isSignedIn}
        setIsSignedIn={setIsSignedIn}
        username={username}
        setUsername={setUsername}
        secrets={secrets}
        onImportSecrets={handleImportSecrets}
        uiSettings={uiSettings}
        onUISettingsChange={async (settings) => {
          setUISettings(settings);
          if (storage) {
            try {
              await storage.set("ui_settings", JSON.stringify(settings));
            } catch {
              console.error("Failed to save UI settings");
            }
          }
        }}
        onDeleteAllData={handleDeleteAllData}
      />
    </div>
  );
}
