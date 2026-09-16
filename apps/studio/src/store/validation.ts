"use client";

import { atom } from "jotai";
import { parsedConfigAtom } from "@/store/config";
import type { Step, VideoConfig, ParsedConfig } from "@/store/config";

export interface ValidationIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

const ACTIONS_REQUIRING_SELECTOR_OR_TEXT = new Set([
  "click",
  "hover",
  "wait",
  "moveTo",
  "select",
]);

function validateStep(step: Step, index: number, videoName: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const base = `videos.${videoName}.steps[${index}]`;

  if (!step.action) {
    issues.push({ level: "error", path: base, message: "Step missing action" });
    return issues;
  }

  if (step.action === "pause") {
    if (step.ms == null || typeof step.ms !== "number" || step.ms <= 0) {
      issues.push({
        level: "warning",
        path: `${base}.ms`,
        message: "Pause should have a positive ms value",
      });
    }
  }

  if (ACTIONS_REQUIRING_SELECTOR_OR_TEXT.has(step.action)) {
    if (!step.selector && !step.text) {
      issues.push({
        level: "warning",
        path: base,
        message: `${step.action} step needs a selector or text target`,
      });
    }
  }

  if (step.action === "type") {
    if (!step.text) {
      issues.push({
        level: "warning",
        path: `${base}.text`,
        message: "Type step needs text to type",
      });
    }
  }

  if (step.action === "key") {
    if (!step.key) {
      issues.push({
        level: "error",
        path: `${base}.key`,
        message: "Key step requires a key value",
      });
    }
  }

  if (step.action === "navigate") {
    if (!step.url) {
      issues.push({
        level: "error",
        path: `${base}.url`,
        message: "Navigate step requires a URL",
      });
    }
  }

  if (step.action === "screenshot") {
    if (!step.output) {
      issues.push({
        level: "warning",
        path: `${base}.output`,
        message: "Screenshot step should have an output path",
      });
    }
  }

  if (step.action === "drag") {
    if (!step.from) {
      issues.push({
        level: "error",
        path: `${base}.from`,
        message: "Drag step requires a from target",
      });
    }
    if (!step.to) {
      issues.push({
        level: "error",
        path: `${base}.to`,
        message: "Drag step requires a to target",
      });
    }
  }

  if (step.action === "select") {
    if (!step.value) {
      issues.push({
        level: "warning",
        path: `${base}.value`,
        message: "Select step should have a value",
      });
    }
  }

  if (typeof step.delay === "number" && step.delay < 0) {
    issues.push({
      level: "warning",
      path: `${base}.delay`,
      message: "Delay should not be negative",
    });
  }

  return issues;
}

function validateVideo(video: VideoConfig, name: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const base = `videos.${name}`;

  if (!video.url) {
    issues.push({ level: "error", path: `${base}.url`, message: "Video requires a URL" });
  }

  if (!video.steps || video.steps.length === 0) {
    issues.push({
      level: "warning",
      path: `${base}.steps`,
      message: "Video has no steps",
    });
  }

  if (video.fps != null && (video.fps < 1 || video.fps > 120)) {
    issues.push({
      level: "warning",
      path: `${base}.fps`,
      message: "FPS should be between 1 and 120",
    });
  }

  if (video.quality != null && (video.quality < 1 || video.quality > 100)) {
    issues.push({
      level: "warning",
      path: `${base}.quality`,
      message: "Quality should be between 1 and 100",
    });
  }

  if (video.zoom != null && (video.zoom < 0.1 || video.zoom > 10)) {
    issues.push({
      level: "warning",
      path: `${base}.zoom`,
      message: "Zoom seems extreme",
    });
  }

  for (let i = 0; i < (video.steps ?? []).length; i++) {
    issues.push(...validateStep(video.steps[i], i, name));
  }

  return issues;
}

function validateConfig(config: ParsedConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!config.videos || Object.keys(config.videos).length === 0) {
    issues.push({
      level: "error",
      path: "videos",
      message: "Config has no videos defined",
    });
    return issues;
  }

  for (const [name, video] of Object.entries(config.videos)) {
    issues.push(...validateVideo(video, name));
  }

  return issues;
}

export const validationIssuesAtom = atom<ValidationIssue[]>((get) => {
  const { config, error } = get(parsedConfigAtom);
  if (error) {
    return [{ level: "error", path: "", message: `JSON parse error: ${error}` }];
  }
  if (!config) return [];
  return validateConfig(config);
});

export const errorCountAtom = atom((get) => {
  const issues = get(validationIssuesAtom);
  return issues.filter((i) => i.level === "error").length;
});

export const warningCountAtom = atom((get) => {
  const issues = get(validationIssuesAtom);
  return issues.filter((i) => i.level === "warning").length;
});
