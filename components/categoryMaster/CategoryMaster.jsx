"use client";
import React, { useState } from "react";
import { Tags, ListChecks } from "lucide-react";
import MasterCrud from "../common/MasterCrud";
import CategorySpecificationModal from "./CategorySpecificationModal";

export default function CategoryMaster() {
  const [specCategory, setSpecCategory] = useState(null);

  return (
    <>
      <MasterCrud
        icon={Tags}
        title="Category Master"
        subtitle="Manage your inventory categories"
        entityLabel="Category"
        entityLabelPlural="categories"
        listEndpoint="/Inventory/GetCategoryList"
        saveEndpoint="/Inventory/SaveOrUpdateCategory"
        deleteEndpoint="/Inventory/DeleteCategory"
        idKey="categoryId"
        requiredMessage="Please enter category name"
        deleteConfirm={{ text: "This category will be deactivated" }}
        fields={[
          { key: "name", label: "Category Name", placeholder: "Enter Category Name", required: true },
          { key: "showMrp", label: "Show MRP for items in this category", type: "checkbox" },
        ]}
        columns={[
          { key: "categoryName", label: "Category Name" },
          { key: "showMrp", label: "Show MRP", render: (row) => (row.showMrp ? "Yes" : "No") },
        ]}
        buildPayload={(id, values) => ({
          CategoryId: id || "0",
          CategoryName: (values.name || "").trim(),
          ShowMrp: !!values.showMrp,
        })}
        deletePayload={(id) => ({ categoryId: id })}
        mapEditValues={(row) => ({ name: row.categoryName || "", showMrp: !!row.showMrp })}
        rowActions={(row) => (
          <button
            onClick={() => setSpecCategory(row)}
            title="Manage Specifications"
            className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors tooltip"
          >
            <ListChecks size={16} />
          </button>
        )}
      />

      {specCategory && (
        <CategorySpecificationModal category={specCategory} onClose={() => setSpecCategory(null)} />
      )}
    </>
  );
}

