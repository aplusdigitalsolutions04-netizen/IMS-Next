"use client";
import React from "react";
import { useParams } from "next/navigation";
import ClientForm from "@/components/clientMaster/ClientForm";

export default function EditClientPage() {
  const { id } = useParams();
  return <ClientForm clientGuid={id} />;
}
