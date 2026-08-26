"use client";
import React, { useState, useEffect } from 'react';
import { X, Plus, Tag as TagIcon, Palette, Check, Trash2 } from 'lucide-react';
import { printerService } from '@/lib/services/api';
import { useToast } from '@/lib/client/ToastContext';

export default function AppearanceModal({ isOpen, onClose, item, type, onUpdated }) {
  const toast = useToast();
  const [rowColor, setRowColor] = useState('');
  const [rowIntensity, setRowIntensity] = useState(15);
  const [colorLabel, setColorLabel] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [globalTags, setGlobalTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#4f46e5');
  const [tagIntensity, setTagIntensity] = useState(15);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [loading, setLoading] = useState(false);

  const colors = [
    { name: 'None', value: '' },
    { name: 'Red (Urgent)', value: 'priority-red' },
    { name: 'Yellow (Warning)', value: 'priority-yellow' },
    { name: 'Green (Safe)', value: 'priority-green' },
    { name: 'Blue (In Progress)', value: 'priority-blue' },
    { name: 'Indigo (Info)', value: 'priority-indigo' },
    { name: 'Purple (Special)', value: 'priority-purple' },
  ];

  useEffect(() => {
    if (isOpen) {
      const rawColor = item?.rowColor || '';
      if (rawColor.includes('|')) {
        const [cls, intensity, label] = rawColor.split('|');
        setRowColor(cls);
        setRowIntensity(parseInt(intensity) || 15);
        setColorLabel(label || '');
      } else {
        setRowColor(rawColor);
        setRowIntensity(15);
        setColorLabel('');
      }

      try {
        const parsedTags = item?.tags ? JSON.parse(item.tags) : [];
        setSelectedTags(Array.isArray(parsedTags) ? parsedTags : []);
      } catch (_e) {
        setSelectedTags([]);
      }
      fetchGlobalTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item]);

  const fetchGlobalTags = async () => {
    try {
      const data = await printerService.getGlobalTags();
      const moduleKey = (type === 'in' || type === 'out' || type === 'stationery' || (type === 'return' && item?.modelName === 'Stationery')) ? 'stationery' : 'printer';
      setGlobalTags(data[moduleKey] || []);
    } catch (err) {
      console.error("Failed to fetch tags", err);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Filter out tags that are no longer in globalTags before saving
      const validTags = selectedTags.filter(t => globalTags.some(gt => gt.tagName === t.tagName));
      const tagsJson = JSON.stringify(validTags);
      const finalRowColor = rowColor ? `${rowColor}|${rowIntensity}|${colorLabel.trim()}` : '';
      const itemId = item?.guid || item?.id || item?.stockOutId || item?.stockInId;

      if (!itemId) {
        throw new Error('Missing item identifier for appearance update');
      }

      if (type === 'in' || type === 'out' || (type === 'return' && item?.modelName === 'Stationery')) {
        const stationeryType = type === 'return' ? 'stationery_return' : type;
        await printerService.updateStationeryAppearance({
          type: stationeryType,
          id: itemId,
          rowColor: finalRowColor,
          tags: tagsJson
        });
      } else if (type === 'return') {
        await printerService.updateReturnAppearance(itemId, {
          rowColor: finalRowColor,
          tags: tagsJson
        });
      } else {
        await printerService.updateAppearance(itemId, {
          rowColor: finalRowColor,
          tags: tagsJson
        });
      }
      onUpdated();
      onClose();
    } catch (err) {
      toast.error("Failed to save appearance: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tag) => {
    const exists = selectedTags.find(t => t.tagName === tag.tagName);
    if (exists) {
      setSelectedTags(selectedTags.filter(t => t.tagName !== tag.tagName));
    } else {
      setSelectedTags([...selectedTags, { tagName: tag.tagName, tagColor: tag.tagColor }]);
    }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    const trimmedName = newTagName.trim();
    if (!trimmedName) return;
    
    // Check for duplicates
    const exists = globalTags.find(t => t.tagName.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
      toast.warning("A tag with this name already exists!");
      return;
    }

    try {
      const moduleKey = (type === 'in' || type === 'out' || type === 'stationery' || (type === 'return' && item?.modelName === 'Stationery')) ? 'stationery' : 'printer';
      await printerService.createGlobalTag({
        tagName: trimmedName,
        tagColor: `${newTagColor}|${tagIntensity}`,
        module: moduleKey
      });
      
      // Auto-select the new tag
      setSelectedTags([...selectedTags, { tagName: trimmedName, tagColor: `${newTagColor}|${tagIntensity}` }]);
      
      setNewTagName('');
      setIsAddingTag(false);
      fetchGlobalTags();
    } catch (err) {
      toast.error("Failed to create tag: " + err.message);
    }
  };

  const handleDeleteGlobalTag = async (id) => {
    if (!window.confirm("Delete this global tag?")) return;
    try {
      const moduleKey = (type === 'in' || type === 'out' || type === 'stationery') ? 'stationery' : 'printer';
      await printerService.deleteGlobalTag(id, moduleKey);
      fetchGlobalTags();
    } catch (err) {
      toast.error("Failed to delete tag: " + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Palette className="text-indigo-600" size={20} /> Row Appearance
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Customize highlighting & tags</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-xl transition-colors shadow-sm">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
          {/* Color Highlighting */}
          <section>
            <label className="text-sm font-bold text-slate-700 block mb-4 flex items-center gap-2">
              <Palette size={16} className="text-indigo-500" /> Highlight Color
            </label>
            
            {/* Improved Color Grid */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              {colors.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setRowColor(c.value)}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all ${
                    rowColor === c.value 
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-md scale-105' 
                    : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                  title={c.name}
                >
                  <div 
                    className={`w-8 h-8 rounded-full border-2 border-white shadow-sm ${c.value || 'bg-white'}`} 
                    style={{ '--row-opacity': 0.8 }}
                  />
                  <span className="text-[10px] font-bold text-slate-600 mt-1.5 truncate max-w-full">
                    {c.name.split(' ')[0]}
                  </span>
                  {rowColor === c.value && (
                    <div className="absolute -top-1 -right-1 bg-indigo-600 text-white rounded-full p-0.5 shadow-md">
                      <Check size={10} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {rowColor && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                {/* Custom Label Input */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    What does this color mean? (Label)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Urgent, Pending, Safe..."
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white"
                    value={colorLabel}
                    onChange={(e) => setColorLabel(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">This label will be shown on the row when applied.</p>
                </div>

                {/* Intensity Slider */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Color Intensity</label>
                    <span className="text-sm font-black text-indigo-600 bg-white px-2 py-1 rounded-lg border border-indigo-100 shadow-sm">{rowIntensity}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={rowIntensity}
                    onChange={(e) => setRowIntensity(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] font-bold text-slate-400">Subtle</span>
                    <span className="text-[10px] font-bold text-slate-400">Vibrant</span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Tags */}
          <section>
            <div className="flex justify-between items-center mb-4">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <TagIcon size={16} className="text-indigo-500" /> Tags
              </label>
              <button 
                onClick={() => setIsAddingTag(!isAddingTag)}
                className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"
              >
                <Plus size={14} /> New Global Tag
              </button>
            </div>

            {isAddingTag && (
              <form onSubmit={handleCreateTag} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-4 animate-in slide-in-from-top duration-200">
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Tag Name"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    required
                  />
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      className="h-10 w-20 rounded-lg cursor-pointer border-0 p-0"
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                    />
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">Intensity: {tagIntensity}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="5"
                        value={tagIntensity}
                        onChange={(e) => setTagIntensity(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                    <button type="submit" className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-100">
                      Create
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="flex flex-wrap gap-2">
              {globalTags.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">No global tags created yet.</p>
              ) : (
                globalTags.map((tag) => {
                  const isSelected = selectedTags.some(t => t.tagName === tag.tagName);
                  return (
                    <div key={tag.id} className="group relative">
                      <button
                        onClick={() => toggleTag(tag)}
                        style={{ 
                          backgroundColor: isSelected ? tag.tagColor : 'transparent',
                          borderColor: tag.tagColor,
                          color: isSelected ? '#fff' : tag.tagColor
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all flex items-center gap-1.5 ${
                          isSelected ? 'shadow-md scale-105' : 'hover:bg-slate-50'
                        }`}
                      >
                        {tag.tagName}
                        {isSelected && <Check size={12} />}
                      </button>
                      <button 
                        onClick={() => handleDeleteGlobalTag(tag.id)}
                        className="absolute -top-2 -right-2 bg-white text-red-500 p-1 rounded-full shadow-lg border border-red-50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {selectedTags.filter(t => globalTags.some(gt => gt.tagName === t.tagName)).length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Applied to this row (Adjust intensity for each):</p>
                <div className="grid grid-cols-1 gap-3">
                  {selectedTags.filter(t => globalTags.some(gt => gt.tagName === t.tagName)).map((tag, idx) => {
                    const [colorHex, defaultInt] = tag.tagColor.split("|");
                    const currentIntensity = tag.intensity || parseInt(defaultInt) || 15;
                    
                    return (
                      <div key={idx} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex justify-between items-center">
                          <span 
                            style={{ backgroundColor: colorHex + '20', color: colorHex, borderColor: colorHex + '40' }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold border"
                          >
                            {tag.tagName}
                          </span>
                          <span className="text-xs font-black text-indigo-600 bg-white px-2 py-0.5 rounded-md border shadow-sm">
                            {currentIntensity}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="5"
                            max="60"
                            step="5"
                            value={currentIntensity}
                            onChange={(e) => {
                              const newIntensity = parseInt(e.target.value);
                              setSelectedTags(selectedTags.map(t => 
                                t.tagName === tag.tagName ? { ...t, intensity: newIntensity } : t
                              ));
                            }}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl text-sm font-bold text-slate-600 hover:bg-white transition border border-transparent hover:border-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-[2] bg-slate-900 text-white px-4 py-3 rounded-2xl text-sm font-bold hover:bg-slate-800 transition shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Saving...' : 'Apply Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

