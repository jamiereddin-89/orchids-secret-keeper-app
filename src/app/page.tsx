"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
  Tag,
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
  groupLabel: string;
  icon?: string | null;
  domain?: string;
}

interface UISettings {
  displayMode: "full" | "compact";
  textSize: "small" | "medium" | "large";
  defaultExpanded: boolean;
}

interface ProviderMeta {
  group?: string;
  icon?: string | null;
  domain?: string;
}

const defaultUISettings: UISettings = {
  displayMode: "full",
  textSize: "medium",
  defaultExpanded: false,
};

export default function Home() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [username, setUsername] = useState("Local User");
  const [isDark, setIsDark] = useState(true);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [accountExpanded, setAccountExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [formData, setFormData] = useState({ provider: "", secret: "", accountName: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ type: "secret" | "provider"; id: string; name: string } | null>(null);
  const [providerOrder, setProviderOrder] = useState<string[]>([]);
  const [draggedProvider, setDraggedProvider] = useState<string | null>(null);
  const [providerMeta, setProviderMeta] = useState<Record<string, ProviderMeta>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [puterReady, setPuterReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uiSettings, setUISettings] = useState<UISettings>(defaultUISettings);
  const [storage, setStorage] = useState<StorageAdapter | null>(null);

  useEffect(() => {
    const checkPuter = setInterval(() => {
      if (typeof puter !== "undefined") {
        setPuterReady(true);
        clearInterval(checkPuter);
      }
    }, 100);
    setTimeout(() => {
      clearInterval(checkPuter);
      setPuterReady(true);
    }, 2000);
    return () => clearInterval(checkPuter);
  }, []);

  useEffect(() => {
    if (!puterReady) return;
    const isPuterSignedIn = typeof puter !== "undefined" && puter.auth.isSignedIn();
    const adapter = getStorageAdapter(isPuterSignedIn);
    setStorage(adapter);
    setIsSignedIn(isPuterSignedIn);
    if (!isPuterSignedIn) {
      setUsername("Local User");
    } else {
      puter.auth
        .getUser()
        .then((user) => setUsername(user.username || "Local User"))
        .catch(() => setUsername("Local User"));
    }
    setIsLoading(false);
    loadUISettings(adapter);
  }, [puterReady]);

  useEffect(() => {
    if (storage) {
      loadSecrets();
      loadProviderOrder();
      loadProviderMeta();
    }
  }, [storage]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    if (uiSettings.defaultExpanded && providerGroups.length > 0) {
      setExpandedProviders(new Set(providerGroups.map((g) => g.provider)));
    }
  }, [uiSettings.defaultExpanded, providerGroups]);

  const loadUISettings = async (adapter: StorageAdapter) => {
    try {
      const saved = await adapter.get("ui_settings");
      if (saved) {
        setUISettings(JSON.parse(saved));
      }
    } catch {}
  };

  const saveUISettings = async (settings: UISettings) => {
    setUISettings(settings);
    if (storage) {
      try {
        await storage.set("ui_settings", JSON.stringify(settings));
      } catch {}
    }
  };

  const loadProviderMeta = async () => {
    if (!storage) return;
    try {
      const saved = await storage.get("provider_meta");
      if (saved) {
        setProviderMeta(JSON.parse(saved));
      }
    } catch {}
  };

  const updateProviderMeta = (updater: (prev: Record<string, ProviderMeta>) => Record<string, ProviderMeta>) => {
    setProviderMeta((prev) => {
      const next = updater(prev);
      if (storage) {
        storage.set("provider_meta", JSON.stringify(next)).catch(() => {});
      }
      return next;
    });
  };

  const resolveDomain = (provider: string) => {
    const normalized = provider.toLowerCase().trim();
    const map: Record<string, string> = {
      openai: "openai.com",
      stripe: "stripe.com",
      aws: "aws.amazon.com",
      amazon: "amazon.com",
      google: "google.com",
      github: "github.com",
      vercel: "vercel.com",
      supabase: "supabase.com",
      notion: "notion.so",
      slack: "slack.com",
      discord: "discord.com",
    };
    if (map[normalized]) return map[normalized];
    const slug = normalized.replace(/[^a-z0-9]/g, "");
    if (!slug) return null;
    return `${slug}.com`;
  };

  const fetchProviderIcon = async (provider: string) => {
    const domain = resolveDomain(provider);
    if (!domain) return null;
    const url = `https://icon.horse/icon/${domain}`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) return url;
      return url;
    } catch {
      return url;
    }
  };

  const ensureProviderIcon = async (provider: string) => {
    if (!provider || providerMeta[provider]?.icon !== undefined) return;
    const icon = await fetchProviderIcon(provider);
    const domain = resolveDomain(provider) || undefined;
    updateProviderMeta((prev) => ({ ...prev, [provider]: { ...prev[provider], icon, domain } }));
  };

  const loadSecrets = async () => {
    if (!storage) return;
    try {
      const items = await storage.list("secret_*", true);
      const loadedSecrets: Secret[] = items.map((item) => JSON.parse(item.value));
      setSecrets(loadedSecrets);
    } catch {}
  };

  const loadProviderOrder = async () => {
    if (!storage) return;
    try {
      const order = await storage.get("provider_order");
      if (order) {
        setProviderOrder(JSON.parse(order));
      }
    } catch {}
  };

  const saveProviderOrder = async (order: string[]) => {
    if (!storage) return;
    try {
      await storage.set("provider_order", JSON.stringify(order));
      setProviderOrder(order);
    } catch {}
  };

  const groupSecrets = useCallback(() => {
    const groups: Record<string, Secret[]> = {};
    secrets.forEach((secret) => {
      if (!groups[secret.provider]) {
        groups[secret.provider] = [];
      }
      groups[secret.provider].push(secret);
    });

    const providers = Object.keys(groups);
    const orderedProviders = [...providerOrder.filter((p) => providers.includes(p)), ...providers.filter((p) => !providerOrder.includes(p))];

    const result: ProviderGroup[] = orderedProviders.map((provider, index) => {
      const meta = providerMeta[provider] || {};
      return {
        provider,
        secrets: groups[provider].sort((a, b) => a.order - b.order),
        order: index,
        groupLabel: meta.group?.trim() || "Ungrouped",
        icon: meta.icon,
        domain: meta.domain,
      };
    });

    setProviderGroups(result);
  }, [secrets, providerOrder, providerMeta]);

  useEffect(() => {
    groupSecrets();
  }, [groupSecrets]);

  useEffect(() => {
    const providers = Array.from(new Set(secrets.map((s) => s.provider)));
    providers.forEach((p) => {
      if (providerMeta[p]?.icon === undefined) {
        ensureProviderIcon(p);
      }
    });
  }, [secrets, providerMeta]);

  const filteredGroups = providerGroups.filter((group) => {
    const query = searchQuery.toLowerCase();
    if (group.provider.toLowerCase().includes(query)) return true;
    if (group.groupLabel.toLowerCase().includes(query)) return true;
    return group.secrets.some((s) => s.accountName.toLowerCase().includes(query) || s.secret.toLowerCase().includes(query));
  });

  const handleSaveSecret = async () => {
    if (!storage) return;
    if (!formData.provider.trim() || !formData.secret.trim()) {
      toast.error("Provider and Secret are required");
      return;
    }

    const id = editingSecret?.id || `secret_${Date.now()}`;
    const newSecret: Secret = {
      id,
      provider: formData.provider.trim(),
      secret: formData.secret.trim(),
      accountName: formData.accountName.trim() || "Default",
      order: editingSecret?.order || secrets.filter((s) => s.provider === formData.provider.trim()).length,
    };

    try {
      await storage.set(id, JSON.stringify(newSecret));
      await ensureProviderIcon(newSecret.provider);
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
      const toDelete = secrets.filter((s) => s.provider === provider);
      for (const secret of toDelete) {
        await storage.del(secret.id);
      }
      const newOrder = providerOrder.filter((p) => p !== provider);
      await saveProviderOrder(newOrder);
      updateProviderMeta((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      await loadSecrets();
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
      const secretKeys = await storage.list("secret_*", false);
      for (const item of secretKeys) {
        await storage.del(item.key);
      }
      await storage.del("provider_order");
      await storage.del("ui_settings");
      await storage.del("provider_meta");
      setSecrets([]);
      setProviderGroups([]);
      setProviderOrder([]);
      setExpandedProviders(new Set());
      setRevealedSecrets(new Set());
      setAccountExpanded(new Set());
      setUISettings(defaultUISettings);
      setProviderMeta({});
    } catch (error) {
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
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const toggleAccount = (provider: string, accountName: string) => {
    const key = `${provider}::${accountName}`;
    setAccountExpanded((prev) => {
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

  const handleDragOver = (e: React.DragEvent, provider: string) => {
    e.preventDefault();
    if (!draggedProvider || draggedProvider === provider) return;
  };

  const handleDrop = async (targetProvider: string) => {
    if (!draggedProvider || draggedProvider === targetProvider) return;

    const currentOrder = providerGroups.map((g) => g.provider);
    const dragIndex = currentOrder.indexOf(draggedProvider);
    const dropIndex = currentOrder.indexOf(targetProvider);

    const newOrder = [...currentOrder];
    newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, draggedProvider);

    await saveProviderOrder(newOrder);
    setDraggedProvider(null);
    toast.success("Order updated");
  };

  const textSizeClass = {
    small: "text-xs",
    medium: "text-sm",
    large: "text-base",
  }[uiSettings.textSize];

  const compactPadding = uiSettings.displayMode === "compact" ? "p-2" : "p-4";

  if (isLoading || !puterReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-800 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const groupedByLabel = filteredGroups.reduce<Record<string, ProviderGroup[]>>((acc, group) => {
    const label = group.groupLabel || "Ungrouped";
    if (!acc[label]) acc[label] = [];
    acc[label].push(group);
    return acc;
  }, {});

  const sortedGroupLabels = Object.keys(groupedByLabel).sort((a, b) => {
    if (a === "Ungrouped" && b !== "Ungrouped") return 1;
    if (b === "Ungrouped" && a !== "Ungrouped") return -1;
    return a.localeCompare(b);
  });

  const displayUser = username?.trim() || "Local User";

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50` }>
      <Toaster position="top-center" richColors />
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 backdrop-blur">
        <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg">API Vault - JR</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{displayUser}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setIsDark(!isDark)} className="border-slate-200 dark:border-slate-700">
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setIsSettingsOpen(true)} className="border-slate-200 dark:border-slate-700">
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4 pb-12">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className={`flex-1 relative border rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800`}> 
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Search providers, groups, or accounts"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-0 pl-11 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-slate-900 dark:text-slate-50 placeholder:text-slate-400"
            />
          </div>
          <Button
            onClick={() => {
              setEditingSecret(null);
              setFormData({ provider: "", secret: "", accountName: "" });
              setIsAddDialogOpen(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-4"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900">
            <Key className="w-16 h-16 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
            <p className="text-lg font-semibold">{secrets.length === 0 ? "No secrets yet" : "No matches found"}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{secrets.length === 0 ? "Tap + to add your first secret" : "Try another search term"}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {sortedGroupLabels.map((label) => (
              <div key={label} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    <Tag className="w-4 h-4" />
                    <span>{label}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{groupedByLabel[label].length} provider{groupedByLabel[label].length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-3">
                  {groupedByLabel[label].map((group) => {
                    const accountGroups = group.secrets.reduce<Record<string, Secret[]>>((acc, secret) => {
                      const key = secret.accountName || "Default";
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(secret);
                      return acc;
                    }, {});

                    return (
                      <div
                        key={group.provider}
                        draggable
                        onDragStart={() => handleDragStart(group.provider)}
                        onDragOver={(e) => handleDragOver(e, group.provider)}
                        onDrop={() => handleDrop(group.provider)}
                        className={`border rounded-3xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm transition-all ${draggedProvider === group.provider ? "opacity-70 scale-[0.99]" : ""}`}
                      >
                        <Collapsible open={expandedProviders.has(group.provider)} onOpenChange={() => toggleExpand(group.provider)}>
                          <CollapsibleTrigger asChild>
                            <div className={`flex items-center justify-between ${compactPadding} cursor-pointer`}> 
                              <div className="flex items-center gap-3 min-w-0">
                                <GripVertical className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                                <div className="w-11 h-11 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                                  {group.icon ? (
                                    <img src={group.icon} alt={group.provider} className="w-full h-full object-contain" />
                                  ) : (
                                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{group.provider.charAt(0).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h3 className={`font-semibold ${textSizeClass} truncate`}>{group.provider}</h3>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="rounded-full border-slate-200 dark:border-slate-700 text-[11px] px-2 py-0">{group.groupLabel}</Badge>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{group.secrets.length} secret{group.secrets.length !== 1 ? "s" : ""}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget({ type: "provider", id: group.provider, name: group.provider });
                                  }}
                                  className="text-slate-400 hover:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                                {expandedProviders.has(group.provider) ? (
                                  <ChevronDown className="w-5 h-5 text-slate-500" />
                                ) : (
                                  <ChevronRight className="w-5 h-5 text-slate-500" />
                                )}
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t border-slate-100 dark:border-slate-800 px-4 sm:px-6 pb-4 pt-3 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                <div className="col-span-2">
                                  <Label className="text-xs text-slate-500">Group</Label>
                                  <Input
                                    value={providerMeta[group.provider]?.group || ""}
                                    placeholder="Add to group"
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      updateProviderMeta((prev) => ({
                                        ...prev,
                                        [group.provider]: {
                                          ...prev[group.provider],
                                          group: value.trim() ? value : undefined,
                                          domain: prev[group.provider]?.domain || resolveDomain(group.provider) || undefined,
                                          icon: prev[group.provider]?.icon,
                                        },
                                      }));
                                    }}
                                    className="mt-1 text-sm"
                                  />
                                </div>
                                <div className="sm:justify-self-end flex items-end">
                                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[12px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    {providerMeta[group.provider]?.domain || resolveDomain(group.provider) || "No domain"}
                                  </Badge>
                                </div>
                              </div>

                              <div className="space-y-2">
                                {Object.keys(accountGroups)
                                  .sort((a, b) => a.localeCompare(b))
                                  .map((accountName) => {
                                    const accountKey = `${group.provider}::${accountName}`;
                                    const isOpen = accountExpanded.has(accountKey);
                                    return (
                                      <div key={accountName} className="border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/60 dark:bg-slate-900/60">
                                        <button
                                          className="w-full flex items-center justify-between px-3 py-2"
                                          onClick={() => toggleAccount(group.provider, accountName)}
                                        >
                                          <div className="flex items-center gap-2">
                                            {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{accountName}</span>
                                          </div>
                                          <span className="text-xs text-slate-500 dark:text-slate-400">{accountGroups[accountName].length} key{accountGroups[accountName].length !== 1 ? "s" : ""}</span>
                                        </button>
                                        {isOpen && (
                                          <div className="border-t border-slate-100 dark:border-slate-800 space-y-2 p-3">
                                            {accountGroups[accountName].map((secret) => (
                                              <div key={secret.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                                                <div className="flex-1 min-w-0">
                                                  <code className={`flex-1 ${textSizeClass} font-mono bg-white dark:bg-slate-950/60 text-emerald-700 dark:text-emerald-300 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 truncate`}>
                                                    {revealedSecrets.has(secret.id) ? secret.secret : "••••••••••••••••"}
                                                  </code>
                                                </div>
                                                <div className="flex items-center gap-1 self-start sm:self-center">
                                                  <Button variant="ghost" size="icon" onClick={() => toggleReveal(secret.id)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">
                                                    {revealedSecrets.has(secret.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                  </Button>
                                                  <Button variant="ghost" size="icon" onClick={() => handleCopy(secret.secret)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">
                                                    <Copy className="w-4 h-4" />
                                                  </Button>
                                                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(secret)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">
                                                    <Pencil className="w-4 h-4" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setDeleteTarget({ type: "secret", id: secret.id, name: `${secret.provider} - ${secret.accountName}` })}
                                                    className="text-slate-500 hover:text-red-500"
                                                  >
                                                    <Trash2 className="w-4 h-4" />
                                                  </Button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-slate-50">{editingSecret ? "Edit Secret" : "Add New Secret"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-700 dark:text-slate-200">Provider</Label>
              <Input
                placeholder="e.g., OpenAI, Stripe"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                className="mt-1.5 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <Label className="text-slate-700 dark:text-slate-200">Secret - API Key/Token</Label>
              <Input
                placeholder="Enter your secret key or token"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                className="mt-1.5 font-mono bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <Label className="text-slate-700 dark:text-slate-200">Account Name (Optional)</Label>
              <Input
                placeholder="e.g., Production, Personal"
                value={formData.accountName}
                onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                className="mt-1.5 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="flex-1 border-slate-200 dark:border-slate-800">
                Cancel
              </Button>
              <Button onClick={handleSaveSecret} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900 dark:text-slate-50">Delete {deleteTarget?.type === "provider" ? "Provider" : "Secret"}?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 dark:text-slate-400">
              {deleteTarget?.type === "provider"
                ? `This will delete all secrets for "${deleteTarget?.name}". This action cannot be undone.`
                : `This will permanently delete "${deleteTarget?.name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget?.type === "provider") {
                  handleDeleteProvider(deleteTarget.id);
                } else if (deleteTarget) {
                  handleDeleteSecret(deleteTarget.id);
                }
                setDeleteTarget(null);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
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
        onUISettingsChange={saveUISettings}
        onDeleteAllData={handleDeleteAllData}
      />
    </div>
  );
}
