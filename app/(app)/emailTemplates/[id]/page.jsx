"use client";
import React from "react";
import { useParams } from "next/navigation";
import EmailTemplates from "@/components/settings/EmailTemplates";

export default function EditEmailTemplatePage() {
  const { id } = useParams();
  return <EmailTemplates formFor={id} />;
}
