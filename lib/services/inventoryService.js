"use client";

import { legacyApi } from "@/lib/client/http";

const API_URL = "/Inventory";

export const inventoryService = {
  async getVendors() {
    const res = await legacyApi.get(`${API_URL}/GetVendorList`);
    return res.data?.data || [];
  },

  async getStockInCounts() {
    const res = await legacyApi.get(`${API_URL}/GetStockInCounts`);
    return res.data;
  },

  async getStockInDetails(stockInId) {
    const res = await legacyApi.get(`${API_URL}/GetStockInDetails?stockInId=${stockInId}`);
    return res.data?.data || [];
  },

  async getLastDraftStockIn() {
    const res = await legacyApi.get(`${API_URL}/GetLastDraftStockIn`);
    return res.data?.data || [];
  },

  async getStockInList(status, startDate = "", endDate = "", page = 1, limit = 10) {
    let url = `${API_URL}/GetStockInList?status=${status}&page=${page}&limit=${limit}`;
    if (startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    const res = await legacyApi.get(url);
    return res.data;
  },

  async deleteStockInDetail(detailId) {
    return legacyApi.post(`${API_URL}/DeleteStockInDetail`, { detailId });
  },

  async getSerialNumbers(detailId) {
    const res = await legacyApi.get(`${API_URL}/GetStockInSerials?detailId=${detailId}`);
    return res.data?.data || [];
  },

  async saveStockInSerials(payload) {
    const res = await legacyApi.post(`${API_URL}/SaveStockInSerials`, payload);
    return res.data;
  },

  async getUnits() {
    const res = await legacyApi.get(`${API_URL}/GetUnitList`);
    return res.data?.data || [];
  },

  async saveComboMapping(data) {
    const res = await legacyApi.post(`${API_URL}/SaveComboMapping`, data);
    return res.data;
  },

  async getComboDetails(pvId) {
    const res = await legacyApi.get(`${API_URL}/GetComboDetails/${pvId}`);
    return res.data?.data || [];
  },

  async getComboList() {
    const res = await legacyApi.get(`${API_URL}/GetComboList`);
    return res.data?.data || [];
  },

  async deleteCombo(parentVariantId) {
    return legacyApi.post(`${API_URL}/DeleteCombo`, { parentVariantId });
  },

  async deleteSerialNumber(serialId) {
    return legacyApi.post(`${API_URL}/DeleteStockInSerial`, { serialId });
  },

  async lookupBarcode(code) {
    const res = await legacyApi.get(`${API_URL}/LookupBarcode?code=${code}`);
    return res.data;
  },

  async resolveBarcodeForStockIn(code) {
    const res = await legacyApi.get(`${API_URL}/LookupBarcode?code=${code}`);
    return res.data?.data || null;
  },

  async saveDraft(payload) {
    return legacyApi.post(`${API_URL}/SaveStockInDraft`, payload);
  },

  async finalizeStockIn(stockInId) {
    return legacyApi.post(`${API_URL}/FinalizeStockIn`, { stockInId });
  },

  async revertStockIn(stockInId) {
    return legacyApi.post(`${API_URL}/RevertStockIn`, { stockInId });
  },

  async deleteStockIn(stockInId) {
    return legacyApi.post(`${API_URL}/DeleteStockIn`, { stockInId });
  },

  async deleteDraftStockIn(stockInId) {
    return this.deleteStockIn(stockInId);
  },

  async parseInvoice(formData) {
    const res = await legacyApi.post(`${API_URL}/ParseInvoice`, formData);
    return res.data;
  },

  async addVendor(vendorData) {
    const res = await legacyApi.post(`${API_URL}/SaveOrUpdateVendor`, vendorData);
    return res.data;
  },

  async saveVendor(vendorData) {
    return this.addVendor(vendorData);
  },

  async getCurrentStock(params = {}) {
    const res = await legacyApi.get(`${API_URL}/GetCurrentStock`, { params });
    return res.data;
  },

  async getBrands() {
    const res = await legacyApi.get(`${API_URL}/GetBrandList`);
    return res.data?.data || [];
  },

};

export default inventoryService;
