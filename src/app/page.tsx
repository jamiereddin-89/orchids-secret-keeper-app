"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

type ProviderGroupMap = Record<string, string>;
type ProviderLogoMap = Record<string, string | null>;
type AccountExpandMap = Record<string, string[]>;

interface UISettings {
  displayMode: "full" | "compact";
  textSize: "small" | "medium" | "large";
  defaultExpanded: boolean;
}

const defaultUISettings: UISettings = {
  displayMode: "full",
  textSize: "medium",
  defaultExpanded: false,
};

export default function Home() {
  const [isSignedIn, setIsSignedIn] = useState(true);
  const [username, setUsername] = useState("dev_user");
  const [isDark, setIsDark] = useState(true);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [accountExpanded, setAccountExpanded] = useState<AccountExpandMap>({});
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [formData, setFormData] = useState({ provider: "", secret: "", accountName: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ type: "secret" | "provider"; id: string; name: string } | null>(null);
  const [providerOrder, setProviderOrder] = useState<string[]>([]);
  const [providerGroupMap, setProviderGroupMap] = useState<ProviderGroupMap>({});
  const [groupEdits, setGroupEdits] = useState<Record<string, string>>({});
  const [providerLogos, setProviderLogos] = useState<ProviderLogoMap>({});
  const [draggedProvider, setDraggedProvider] = useState<string | null>(null);
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
    setIsLoading(false);
    loadUISettings(adapter);
  }, [puterReady]);

  useEffect(() => {
    if (storage) {
      loadSecrets();
      loadProviderOrder();
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
    } catch {
      console.error("Failed to load UI settings");
    }
  };

  const saveUISettings = async (settings: UISettings) => {
    setUISettings(settings);
    if (storage) {
      try {
        await storage.set("ui_settings", JSON.stringify(settings));
      } catch {
        console.error("Failed to save UI settings");
      }
    }
  };

  const loadSecrets = async () => {
    if (!storage) return;
    try {
      const items = await storage.list("secret_*", true);
      const loadedSecrets: Secret[] = items.map((item) => JSON.parse(item.value));
      setSecrets(loadedSecrets);
    } catch {
      console.error("Failed to load secrets");
    }
  };

  const loadProviderOrder = async () => {
    if (!storage) return;
    try {
      const order = await storage.get("provider_order");
      if (order) {
        setProviderOrder(JSON.parse(order));
      }
    } catch {
      console.error("Failed to load provider order");
    }
  };

  const saveProviderOrder = async (order: string[]) => {
    if (!storage) return;
    try {
      await storage.set("provider_order", JSON.stringify(order));
      setProviderOrder(order);
    } catch {
      console.error("Failed to save provider order");
    }
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

    const result: ProviderGroup[] = orderedProviders.map((provider, index) => ({
      provider,
      secrets: groups[provider].sort((a, b) => a.order - b.order),
      order: index,
    }));

    setProviderGroups(result);
  }, [secrets, providerOrder]);

  useEffect(() => {
    groupSecrets();
  }, [groupSecrets]);

  const filteredGroups = providerGroups.filter((group) => {
    const query = searchQuery.toLowerCase();
    if (group.provider.toLowerCase().includes(query)) return true;
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
      const secretKeys = (await storage.list("secret_*")) || [];
      for (const item of secretKeys) {
        if (item?.key) {
          await storage.del(item.key);
        }
      }
      const metaKeys = ["provider_order", "ui_settings", "provider_group_map", "provider_logo_cache"];
      for (const key of metaKeys) {
        await storage.del(key);
      }
      setSecrets([]);
      setProviderGroups([]);
      setProviderOrder([]);
      setExpandedProviders(new Set());
      setRevealedSecrets(new Set());
      setUISettings(defaultUISettings);
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
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
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
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-slate-400 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" : "bg-gradient-to-br from-slate-100 via-white to-slate-100"}`}>
      <Toaster position="top-center" richColors />
      <header className={`sticky top-0 z-50 ${isDark ? "bg-slate-900/80 border-slate-800/50" : "bg-white/80 border-slate-200"} backdrop-blur-xl border-b`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${isDark ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-emerald-400 to-teal-500"} flex items-center justify-center shadow-lg shadow-emerald-500/20`}>
              <Key className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Secret Keeper</h1>
              <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>{username}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setIsDark(!isDark)} className={isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"}>
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className={isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"}>
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-3 mb-6">
          <div className={`flex-1 relative ${isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-white border-slate-200"} border rounded-xl overflow-hidden`}>
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
            <Input
              placeholder="Search keys, providers, or accounts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`border-0 pl-10 ${isDark ? "bg-transparent text-white placeholder:text-slate-500" : "bg-transparent text-slate-900 placeholder:text-slate-400"} focus-visible:ring-0 focus-visible:ring-offset-0`}
            />
          </div>
          <Button
            onClick={() => {
              setEditingSecret(null);
              setFormData({ provider: "", secret: "", accountName: "" });
              setIsAddDialogOpen(true);
            }}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold px-4 rounded-xl shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        {filteredGroups.length === 0 ? (
          <div className={`text-center py-16 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            <Key className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">{secrets.length === 0 ? "No secrets yet" : "No matches found"}</p>
            <p className="text-sm mt-1">{secrets.length === 0 ? "Click + to add your first secret" : "Try a different search term"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGroups.map((group) => (
              <div
                key={group.provider}
                draggable
                onDragStart={() => handleDragStart(group.provider)}
                onDragOver={(e) => handleDragOver(e, group.provider)}
                onDrop={() => handleDrop(group.provider)}
                className={`${isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-white border-slate-200"} border rounded-2xl overflow-hidden transition-all ${draggedProvider === group.provider ? "opacity-50 scale-[0.98]" : ""}`}
              >
                <Collapsible open={expandedProviders.has(group.provider)} onOpenChange={() => toggleExpand(group.provider)}>
                  <CollapsibleTrigger asChild>
                    <div className={`flex items-center justify-between ${compactPadding} cursor-pointer ${isDark ? "hover:bg-slate-700/30" : "hover:bg-slate-50"} transition-colors`}>
                      <div className="flex items-center gap-3">
                        <GripVertical className={`w-4 h-4 ${isDark ? "text-slate-600" : "text-slate-300"} cursor-grab`} />
                        <div className={`${uiSettings.displayMode === "compact" ? "w-8 h-8" : "w-10 h-10"} rounded-xl ${isDark ? "bg-gradient-to-br from-slate-700 to-slate-800" : "bg-gradient-to-br from-slate-100 to-slate-200"} flex items-center justify-center font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                          {group.provider.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className={`font-semibold ${textSizeClass} ${isDark ? "text-white" : "text-slate-900"}`}>{group.provider}</h3>
                          <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>{group.secrets.length} secret{group.secrets.length !== 1 ? "s" : ""}</p>
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
                          className={isDark ? "text-slate-500 hover:text-red-400" : "text-slate-400 hover:text-red-500"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        {expandedProviders.has(group.provider) ? (
                          <ChevronDown className={`w-5 h-5 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                        ) : (
                          <ChevronRight className={`w-5 h-5 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className={`${isDark ? "border-slate-700/50" : "border-slate-100"} border-t`}>
                      {group.secrets.map((secret) => (
                        <div key={secret.id} className={`${compactPadding} ${isDark ? "border-slate-700/30 hover:bg-slate-700/20" : "border-slate-100 hover:bg-slate-50"} border-b last:border-b-0 transition-colors`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className={`${textSizeClass} font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{secret.accountName}</p>
                              <div className="mt-2 flex items-center gap-2">
                                <code className={`flex-1 ${textSizeClass} font-mono ${isDark ? "bg-slate-900/50 text-emerald-400" : "bg-slate-100 text-emerald-600"} px-3 py-2 rounded-lg truncate`}>
                                  {revealedSecrets.has(secret.id) ? secret.secret : "••••••••••••••••"}
                                </code>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => toggleReveal(secret.id)} className={isDark ? "text-slate-500 hover:text-white" : "text-slate-400 hover:text-slate-700"}>
                                {revealedSecrets.has(secret.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleCopy(secret.secret)} className={isDark ? "text-slate-500 hover:text-white" : "text-slate-400 hover:text-slate-700"}>
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(secret)} className={isDark ? "text-slate-500 hover:text-white" : "text-slate-400 hover:text-slate-700"}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTarget({ type: "secret", id: secret.id, name: `${secret.provider} - ${secret.accountName}` })}
                                className={isDark ? "text-slate-500 hover:text-red-400" : "text-slate-400 hover:text-red-500"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} max-w-md`}>
          <DialogHeader>
            <DialogTitle className={isDark ? "text-white" : "text-slate-900"}>{editingSecret ? "Edit Secret" : "Add New Secret"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className={isDark ? "text-slate-300" : "text-slate-700"}>Provider</Label>
              <Input
                placeholder="e.g., OpenAI, Stripe, AWS"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                className={`mt-1.5 ${isDark ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900"}`}
              />
            </div>
            <div>
              <Label className={isDark ? "text-slate-300" : "text-slate-700"}>Secret - API Key/Token</Label>
              <Input
                placeholder="Enter your secret key or token"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                className={`mt-1.5 font-mono ${isDark ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900"}`}
              />
            </div>
            <div>
              <Label className={isDark ? "text-slate-300" : "text-slate-700"}>Account Name (Optional)</Label>
              <Input
                placeholder="e.g., Production, Personal"
                value={formData.accountName}
                onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                className={`mt-1.5 ${isDark ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900"}`}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className={`flex-1 ${isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : ""}`}>
                Cancel
              </Button>
              <Button onClick={handleSaveSecret} className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white">
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className={isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}>
          <AlertDialogHeader>
            <AlertDialogTitle className={isDark ? "text-white" : "text-slate-900"}>Delete {deleteTarget?.type === "provider" ? "Provider" : "Secret"}?</AlertDialogTitle>
            <AlertDialogDescription className={isDark ? "text-slate-400" : "text-slate-500"}>
              {deleteTarget?.type === "provider"
                ? `This will delete all secrets for "${deleteTarget?.name}". This action cannot be undone.`
                : `This will permanently delete "${deleteTarget?.name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : ""}>Cancel</AlertDialogCancel>
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