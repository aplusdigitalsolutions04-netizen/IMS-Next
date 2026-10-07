"use client";
import React from "react";
import DailyTasks from "@/components/dailyTasks/DailyTasks";
import { getStoredUser } from "@/lib/client/auth";

export default function DailyTasksPage() {
  const currentUser = typeof window !== "undefined" ? getStoredUser() : null;
  return <DailyTasks currentUser={currentUser} />;
}
