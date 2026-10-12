import { STEP_TYPES, type Profile, type Step } from "./types";
import { placeholders } from "./template";

export interface ValidationIssue {
  path: string;
  message: string;
}

const PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
const ID = /^[a-zA-Z][\w-]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SHA256 = /^[0-9a-fA-F]{64}$/;
const SETTING_KEY = /^[\w.]+$/;
const DEVICE_VARS = ["device.serial", "device.model", "device.manufacturer", "profile.name"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Checks a parsed JSON value. Returns a typed profile only when there are no issues. */
export function validateProfile(input: unknown): { profile?: Profile; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message });

  if (!isObject(input)) return { issues: [{ path: "", message: "The profile must be a JSON object." }] };
  const p = input as Record<string, unknown>;

  if (p.schemaVersion !== 1) err("schemaVersion", "Must be 1.");
  if (!isString(p.name)) err("name", "Give the profile a name.");

  if (p.branding !== undefined) {
    if (!isObject(p.branding)) err("branding", "Must be an object.");
    else {
      const b = p.branding;
      if (b.accent !== undefined && !(typeof b.accent === "string" && HEX.test(b.accent))) err("branding.accent", "Use a hex colour like #2457d6.");
      if (b.logo !== undefined && !(typeof b.logo === "string" && /^(data:image\/|https:\/\/)/.test(b.logo))) err("branding.logo", "Use a data:image URI or an https URL.");
    }
  }

  const appIds = new Set<string>();
  if (!Array.isArray(p.apps)) err("apps", "List the apps to install (it can be empty).");
  else p.apps.forEach((a, i) => {
    const at = `apps[${i}]`;
    if (!isObject(a)) return err(at, "Must be an object.");
    if (!(typeof a.id === "string" && ID.test(a.id))) err(`${at}.id`, "Use letters, digits, - or _.");
    else if (appIds.has(a.id)) err(`${at}.id`, `Duplicate id "${a.id}".`);
    else appIds.add(a.id);
    if (!(typeof a.packageName === "string" && PACKAGE.test(a.packageName))) err(`${at}.packageName`, "Must be a package name like com.example.app.");
    if (a.url !== undefined && !(typeof a.url === "string" && a.url.startsWith("https://"))) err(`${at}.url`, "Must be an https URL.");
    if (a.sha256 !== undefined && !(typeof a.sha256 === "string" && SHA256.test(a.sha256))) err(`${at}.sha256`, "Must be 64 hex characters.");
  });

  if (p.deviceOwner !== undefined) {
    const d = p.deviceOwner;
    if (!isObject(d)) err("deviceOwner", "Must be an object.");
    else {
      if (!(typeof d.app === "string" && appIds.has(d.app))) err("deviceOwner.app", "Must be the id of an app in apps.");
      if (!(typeof d.receiver === "string" && /^\.?[a-zA-Z][\w.$]*$/.test(d.receiver))) err("deviceOwner.receiver", "Use \".Receiver\" or a full class name.");
    }
  }

  const fieldIds = new Set<string>();
  if (p.fields !== undefined) {
    if (!Array.isArray(p.fields)) err("fields", "Must be a list.");
    else p.fields.forEach((f, i) => {
      const at = `fields[${i}]`;
      if (!isObject(f)) return err(at, "Must be an object.");
      if (!(typeof f.id === "string" && ID.test(f.id))) err(`${at}.id`, "Use letters, digits, - or _.");
      else if (fieldIds.has(f.id)) err(`${at}.id`, `Duplicate id "${f.id}".`);
      else fieldIds.add(f.id);
      if (!isString(f.label)) err(`${at}.label`, "Give the field a label.");
      if (f.pattern !== undefined) {
        try { new RegExp(String(f.pattern)); } catch { err(`${at}.pattern`, "Not a valid regular expression."); }
      }
    });
  }

  if (p.checks !== undefined && !isObject(p.checks)) err("checks", "Must be an object.");

  const knownVars = new Set([...DEVICE_VARS, ...[...fieldIds].map((f) => `field.${f}`)]);
  const checkText = (path: string, value: unknown) => {
    if (typeof value !== "string") return;
    for (const v of placeholders(value)) if (!knownVars.has(v)) err(path, `Unknown placeholder {{${v}}}.`);
  };

  if (!Array.isArray(p.steps) || p.steps.length === 0) err("steps", "Add at least one step.");
  else p.steps.forEach((s, i) => {
    const at = `steps[${i}]`;
    if (!isObject(s)) return err(at, "Must be an object.");
    if (!STEP_TYPES.includes(s.type as Step["type"])) return err(`${at}.type`, `Unknown step type "${String(s.type)}".`);
    const needApp = () => { if (!(typeof s.app === "string" && appIds.has(s.app))) err(`${at}.app`, "Must be the id of an app in apps."); };
    const needList = (key: string) => { if (!(Array.isArray(s[key]) && (s[key] as unknown[]).length && (s[key] as unknown[]).every(isString))) err(`${at}.${key}`, "Must be a non-empty list of strings."); };

    switch (s.type) {
      case "install": case "launch": needApp(); break;
      case "grantPermissions": needApp(); needList("permissions"); break;
      case "setDeviceOwner": case "verifyDeviceOwner":
        if (p.deviceOwner === undefined) err(at, "Needs deviceOwner to be set in the profile.");
        break;
      case "setting":
        if (!["global", "secure", "system"].includes(String(s.namespace))) err(`${at}.namespace`, "Must be global, secure or system.");
        if (!(typeof s.key === "string" && SETTING_KEY.test(s.key))) err(`${at}.key`, "Use a setting name like stay_on_while_plugged_in.");
        if (typeof s.value !== "string") err(`${at}.value`, "Must be a string.");
        checkText(`${at}.value`, s.value);
        break;
      case "pushFile":
        if (!(typeof s.path === "string" && s.path.startsWith("/"))) err(`${at}.path`, "Must be an absolute device path.");
        if (typeof s.content !== "string") err(`${at}.content`, "Must be a string.");
        checkText(`${at}.content`, s.content);
        checkText(`${at}.path`, s.path);
        break;
      case "broadcast":
        if (!isString(s.component) && !isString(s.action)) err(at, "Set component, action, or both.");
        if (s.extras !== undefined) {
          if (!isObject(s.extras)) err(`${at}.extras`, "Must be an object.");
          else for (const [k, v] of Object.entries(s.extras)) {
            if (!["string", "number", "boolean"].includes(typeof v)) err(`${at}.extras.${k}`, "Must be a string, number or boolean.");
            checkText(`${at}.extras.${k}`, v);
          }
        }
        break;
      case "disablePackages": needList("packages"); break;
      case "shell":
        if (!isString(s.command)) err(`${at}.command`, "Write the command to run.");
        if (!isString(s.label)) err(`${at}.label`, "Shell steps need a label so the operator knows what runs.");
        checkText(`${at}.command`, s.command);
        break;
    }
  });

  if (p.guide !== undefined) {
    if (!isObject(p.guide) || !Object.values(p.guide).every((v) => typeof v === "string")) err("guide", "Map each locale to Markdown text.");
  }

  return issues.length ? { issues } : { profile: input as unknown as Profile, issues };
}
