"use client";
import React from "react";
import Tasks from "@/components/tasks/Tasks";
import { getStoredUser } from "@/lib/client/auth";

export default function TasksPage() {
  let currentUser = null;
  if (typeof window !== "undefined") {
    currentUser = getStoredUser();
  }
  return <Tasks currentUser={currentUser} />;
}
