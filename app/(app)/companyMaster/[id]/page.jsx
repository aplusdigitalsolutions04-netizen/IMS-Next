"use client";
import React from "react";
import { useParams } from "next/navigation";
import CompanyForm from "@/components/companyMaster/CompanyForm";

export default function EditCompanyPage() {
  const { id } = useParams();
  return <CompanyForm companyGuid={id} />;
}
