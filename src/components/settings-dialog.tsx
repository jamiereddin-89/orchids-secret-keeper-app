"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  LogIn,
  LogOut,
  User,
  Download,
  Upload,
  ClipboardPaste,
  ExternalLink,
  Cloud,
  Palette,
  Database,
  Info,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

declare const puter: {
  auth: {
    signIn: () => Promise<boolean>;
    signOut: () => Promise<void>;
    isSignedIn: () => boolean;
    getUser: () => Promise<{ username: string; email?: string; uuid?: string }>;
    getMonthlyUsage?: () => Promise<{ used: number; limit: number }>;
  };
  kv: {
    set: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | null>;
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

interface UISettings {
  displayMode: "full" | "compact";
  textSize: "small" | "medium" | "large";
  defaultExpanded: boolean;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  isSignedIn: boolean;
  setIsSignedIn: (signedIn: boolean) => void;
  username: string;
  setUsername: (name: string) => void;
  secrets: Secret[];
  onImportSecrets: (secrets: Secret[]) => Promise<void>;
  uiSettings: UISettings;
  onUISettingsChange: (settings: UISettings) => void;
  onDeleteAllData: () => Promise<void>;
}

export function SettingsDialog({
  open,
  onOpenChange,
  isDark,
  setIsDark,
  isSignedIn,
  setIsSignedIn,
  username,
  setUsername,
  secrets,
  onImportSecrets,
  uiSettings,
  onUISettingsChange,
  onDeleteAllData,
}: SettingsDialogProps) {
  const [puterUser, setPuterUser] = useState<{ username: string; email?: string; uuid?: string } | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<{ used: number; limit: number } | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pasteContent, setPasteContent] = useState("");
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && isSignedIn && typeof puter !== "undefined") {
      loadPuterUserData();
    }
  }, [open, isSignedIn]);

  const loadPuterUserData = async () => {
    try {
      if (puter.auth.isSignedIn()) {
        const user = await puter.auth.getUser();
        setPuterUser(user);
        if (puter.auth.getMonthlyUsage) {
          const usage = await puter.auth.getMonthlyUsage();
          setMonthlyUsage(usage);
        }
      }
    } catch (error) {
      console.error("Failed to load Puter user data:", error);
    }
  };

  const handleSignIn = async () => {
    try {
      await puter.auth.signIn();
      const signedIn = puter.auth.isSignedIn();
      setIsSignedIn(signedIn);
      if (signedIn) {
        const user = await puter.auth.getUser();
        setUsername(user.username);
        setPuterUser(user);
        toast.success("Signed in successfully");
      }
    } catch {
      toast.error("Sign in failed");
    }
  };

  const handleSignOut = async () => {
    try {
      await puter.auth.signOut();
      setIsSignedIn(false);
      setUsername("");
      setPuterUser(null);
      setMonthlyUsage(null);
      toast.success("Signed out");
    } catch {
      toast.error("Sign out failed");
    }
  };

  const handleExport = () => {
    const exportData = secrets.map((s) => ({
      provider: s.provider,
      accountName: s.accountName,
      secret: s.secret,
    }));

    const envContent = secrets
      .map((s) => {
        const keyName = `${s.provider.toUpperCase().replace(/\s+/g, "_")}_${s.accountName.toUpperCase().replace(/\s+/g, "_")}`;
        return `${keyName}=${s.secret}`;
      })
      .join("\n");

    const fullContent = `# Secret Keeper Export\n# Generated: ${new Date().toISOString()}\n\n${envContent}\n\n# JSON Format:\n# ${JSON.stringify(exportData)}`;

    const blob = new Blob([fullContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "secrets.env.download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Secrets exported");
  };

  const parseImportContent = (content: string): Secret[] => {
    const results: Secret[] = [];
    const lines = content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

    let currentProvider: string | null = null;
    let currentUsername: string | null = null;
    let currentKey: string | null = null;

    for (const line of lines) {
      const cleanLine = line.replace(/,\s*$/, "").trim();
      
      if (!cleanLine.includes("=")) continue;

      const eqIndex = cleanLine.indexOf("=");
      const fieldName = cleanLine.substring(0, eqIndex).trim().toUpperCase();
      const fieldValue = cleanLine.substring(eqIndex + 1).trim();

      if (fieldName.includes("PROVIDER") || fieldName === "PROVIDER_NAME") {
        if (currentProvider && currentKey) {
          results.push({
            id: `secret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            provider: currentProvider,
            secret: currentKey,
            accountName: currentUsername || "Default",
            order: results.length,
          });
        }
        currentProvider = fieldValue;
        currentUsername = null;
        currentKey = null;
      } else if (fieldName.includes("USERNAME") || fieldName === "USERNAME") {
        currentUsername = fieldValue || null;
      } else if (fieldName.includes("KEY") || fieldName.includes("TOKEN") || fieldName.includes("SECRET") || fieldName.includes("API")) {
        currentKey = fieldValue;
      } else {
        currentKey = fieldValue;
      }
    }

    if (currentProvider && currentKey) {
      results.push({
        id: `secret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        provider: currentProvider,
        secret: currentKey,
        accountName: currentUsername || "Default",
        order: results.length,
      });
    }

    if (results.length === 0) {
      for (const line of lines) {
        const cleanLine = line.replace(/,\s*$/, "").trim();
        if (cleanLine.includes("=")) {
          const [key, ...valueParts] = cleanLine.split("=");
          const value = valueParts.join("=").trim();
          const keyParts = key.trim().split("_");
          const provider = keyParts.slice(0, -1).join(" ") || keyParts[0] || "Unknown";
          const accountName = keyParts[keyParts.length - 1] || "Default";

          results.push({
            id: `secret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            provider: provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase(),
            secret: value,
            accountName: accountName.charAt(0).toUpperCase() + accountName.slice(1).toLowerCase(),
            order: results.length,
          });
        }
      }
    }

    try {
      const jsonMatch = content.match(/# JSON Format:\s*#\s*(\[.+\])/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[1]);
        return jsonData.map((item: { provider: string; accountName: string; secret: string }, idx: number) => ({
          id: `secret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          provider: item.provider,
          secret: item.secret,
          accountName: item.accountName || "Default",
          order: idx,
        }));
      }
    } catch {}

    return results;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const parsed = parseImportContent(content);
      if (parsed.length > 0) {
        await onImportSecrets(parsed);
        toast.success(`Imported ${parsed.length} secrets`);
        setShowImportDialog(false);
      } else {
        toast.error("No valid secrets found in file");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePasteImport = async () => {
    const parsed = parseImportContent(pasteContent);
    if (parsed.length > 0) {
      await onImportSecrets(parsed);
      toast.success(`Imported ${parsed.length} secrets`);
      setPasteContent("");
      setShowPasteInput(false);
      setShowImportDialog(false);
    } else {
      toast.error("No valid secrets found");
    }
  };

  const credentialsCount = secrets.length;
  const providersCount = new Set(secrets.map((s) => s.provider)).size;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} max-w-lg max-h-[85vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className={isDark ? "text-white" : "text-slate-900"}>Settings</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="puter" className="mt-4">
            <TabsList className={`grid w-full grid-cols-4 ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
              <TabsTrigger value="puter" className={`text-xs ${isDark ? "data-[state=active]:bg-slate-700" : ""}`}>
                <Cloud className="w-3 h-3 mr-1" /> Puter
              </TabsTrigger>
              <TabsTrigger value="ui" className={`text-xs ${isDark ? "data-[state=active]:bg-slate-700" : ""}`}>
                <Palette className="w-3 h-3 mr-1" /> UI
              </TabsTrigger>
              <TabsTrigger value="data" className={`text-xs ${isDark ? "data-[state=active]:bg-slate-700" : ""}`}>
                <Database className="w-3 h-3 mr-1" /> Data
              </TabsTrigger>
              <TabsTrigger value="about" className={`text-xs ${isDark ? "data-[state=active]:bg-slate-700" : ""}`}>
                <Info className="w-3 h-3 mr-1" /> About
              </TabsTrigger>
            </TabsList>

            <TabsContent value="puter" className="space-y-4 mt-4">
              <div className={`p-4 rounded-xl ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"} border`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${isDark ? "bg-emerald-500/20" : "bg-emerald-100"} flex items-center justify-center`}>
                    <User className={`w-6 h-6 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                  </div>
                  <div>
                    <p className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                      {puterUser?.username || username || "Not signed in"}
                    </p>
                    {puterUser?.email && (
                      <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{puterUser.email}</p>
                    )}
                  </div>
                </div>

                {puterUser?.uuid && (
                  <div className={`text-xs mb-3 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    UUID: {puterUser.uuid}
                  </div>
                )}

                {monthlyUsage && typeof monthlyUsage.used === "number" && typeof monthlyUsage.limit === "number" && (
                  <div className={`mb-4 p-3 rounded-lg ${isDark ? "bg-slate-900/50" : "bg-white"}`}>
                    <p className={`text-sm font-medium mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Monthly Usage</p>
                    <div className="w-full bg-slate-700 rounded-full h-2 mb-1">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min((monthlyUsage.used / monthlyUsage.limit) * 100, 100)}%` }}
                      />
                    </div>
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {monthlyUsage.used.toLocaleString()} / {monthlyUsage.limit.toLocaleString()} used
                    </p>
                  </div>
                )}

                {isSignedIn && typeof puter !== "undefined" && puter.auth.isSignedIn() ? (
                  <Button onClick={handleSignOut} variant="outline" className={`w-full ${isDark ? "border-red-500/50 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-600 hover:bg-red-50"}`}>
                    <LogOut className="w-4 h-4 mr-2" /> Sign Out
                  </Button>
                ) : (
                  <Button onClick={handleSignIn} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white">
                    <LogIn className="w-4 h-4 mr-2" /> Sign In with Puter
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="ui" className="space-y-4 mt-4">
              <div className={`p-4 rounded-xl ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"} border space-y-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className={isDark ? "text-white" : "text-slate-900"}>Dark Mode</Label>
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Toggle dark/light theme</p>
                  </div>
                  <Switch checked={isDark} onCheckedChange={setIsDark} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className={isDark ? "text-white" : "text-slate-900"}>Compact Mode</Label>
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Reduce spacing and padding</p>
                  </div>
                  <Switch
                    checked={uiSettings.displayMode === "compact"}
                    onCheckedChange={(checked) => onUISettingsChange({ ...uiSettings, displayMode: checked ? "compact" : "full" })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className={isDark ? "text-white" : "text-slate-900"}>Default Expanded</Label>
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Expand sections by default</p>
                  </div>
                  <Switch
                    checked={uiSettings.defaultExpanded}
                    onCheckedChange={(checked) => onUISettingsChange({ ...uiSettings, defaultExpanded: checked })}
                  />
                </div>

                <div>
                  <Label className={`mb-2 block ${isDark ? "text-white" : "text-slate-900"}`}>Text Size</Label>
                  <div className="flex gap-2">
                    {(["small", "medium", "large"] as const).map((size) => (
                      <Button
                        key={size}
                        variant={uiSettings.textSize === size ? "default" : "outline"}
                        size="sm"
                        onClick={() => onUISettingsChange({ ...uiSettings, textSize: size })}
                        className={`flex-1 capitalize ${uiSettings.textSize === size ? "bg-emerald-500 hover:bg-emerald-600" : isDark ? "border-slate-700" : ""}`}
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-xl ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"} border`}>
                <p className={`text-sm font-medium mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>Analytics</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-lg ${isDark ? "bg-slate-900/50" : "bg-white"}`}>
                    <p className={`text-2xl font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{credentialsCount}</p>
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Total Credentials</p>
                  </div>
                  <div className={`p-3 rounded-lg ${isDark ? "bg-slate-900/50" : "bg-white"}`}>
                    <p className={`text-2xl font-bold ${isDark ? "text-teal-400" : "text-teal-600"}`}>{providersCount}</p>
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Providers</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="data" className="space-y-4 mt-4">
              <div className={`p-4 rounded-xl ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"} border space-y-3`}>
                <Button onClick={handleExport} variant="outline" className={`w-full ${isDark ? "border-slate-600 hover:bg-slate-700" : ""}`}>
                  <Download className="w-4 h-4 mr-2" /> Export Secrets
                </Button>
                <Button onClick={() => setShowImportDialog(true)} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white">
                  <Upload className="w-4 h-4 mr-2" /> Import Secrets
                </Button>
                <Button
                  onClick={() => setShowDeleteAllDialog(true)}
                  variant="outline"
                  className={`w-full border-red-500/50 text-red-500 hover:bg-red-500/10 ${isDark ? "bg-slate-900/40" : ""}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete All Data
                </Button>
              </div>
              <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                Export downloads a .env.download file. Import supports .env, .txt, .json, .md, .doc, .pdf files with API keys.
              </p>
            </TabsContent>

            <TabsContent value="about" className="space-y-4 mt-4">
              <div className={`p-4 rounded-xl ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"} border`}>
                <div className="text-center mb-4">
                  <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center`}>
                    <Database className="w-8 h-8 text-white" />
                  </div>
                  <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Secret Keeper</h3>
                  <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Version 0.0.5</p>
                </div>

                <div className={`p-3 rounded-lg ${isDark ? "bg-slate-900/50" : "bg-white"} mb-3`}>
                  <p className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    A secure API key and token manager built with Puter.js for cloud storage.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Created by</p>
                  <a
                    href="https://jayreddin.github.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-sm font-medium flex items-center gap-1 ${isDark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-600 hover:text-emerald-700"}`}
                  >
                    Jamie Reddin <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} max-w-md`}>
          {!showPasteInput ? (
            <>
              <DialogHeader>
                <DialogTitle className={isDark ? "text-white" : "text-slate-900"}>Import Secrets</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".env,.txt,.json,.md,.doc,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className={`w-full ${isDark ? "border-slate-600 hover:bg-slate-700" : ""}`}
                >
                  <Upload className="w-4 h-4 mr-2" /> Upload File
                </Button>
                <Button
                  onClick={() => setShowPasteInput(true)}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                >
                  <ClipboardPaste className="w-4 h-4 mr-2" /> Paste Content
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col h-[70vh] max-h-[500px]">
              <div className="flex-shrink-0 flex items-center justify-between pb-3 border-b border-slate-700">
                <DialogTitle className={isDark ? "text-white" : "text-slate-900"}>Paste your secrets</DialogTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowPasteInput(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-hidden py-3">
                <Textarea
                  placeholder={`PROVIDER_NAME=OpenAI,\nUSERNAME=MyAccount, (Optional input),\nKEY_NAME=sk-xxx,\n\nPROVIDER_NAME=Stripe,\nUSERNAME=Production,\nKEY_NAME=sk_live_xxx,`}
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  className={`h-full font-mono text-sm resize-none ${isDark ? "bg-slate-800 border-slate-700 text-white" : ""}`}
                  style={{ 
                    whiteSpace: "pre-wrap", 
                    wordWrap: "break-word",
                    overflowWrap: "break-word"
                  }}
                />
              </div>
              <div className="flex-shrink-0 pt-3 border-t border-slate-700">
                <Button
                  onClick={handlePasteImport}
                  disabled={!pasteContent.trim()}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                >
                  Import
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <AlertDialogHeader>
            <AlertDialogTitle className={isDark ? "text-white" : "text-slate-900"}>Delete all data?</AlertDialogTitle>
            <AlertDialogDescription className={isDark ? "text-slate-400" : "text-slate-500"}>
              This removes all secrets, provider order, and settings from this device/account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : ""}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingAll}
              onClick={async () => {
                try {
                  setIsDeletingAll(true);
                  await onDeleteAllData();
                  toast.success("All data deleted");
                  setShowDeleteAllDialog(false);
                } catch {
                  toast.error("Failed to delete data");
                } finally {
                  setIsDeletingAll(false);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}