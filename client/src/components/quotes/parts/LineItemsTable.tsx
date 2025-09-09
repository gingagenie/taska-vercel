import React, { useState } from 'react';
import ItemPresetInput from '@/components/billing/ItemPresetInput';

// ItemAutocomplete component for smart item selection
function ItemAutocomplete({ 
  value, 
  onChange, 
  onSelectPrevious, 
  previousItems 
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectPrevious: (item: any) => void;
  previousItems: Array<{
    itemName: string;
    description: string;
    price: number;
    tax: string;
  }>;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  
  const filteredItems = previousItems
    .filter(item => item.itemName.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 5); // Show max 5 suggestions

  return (
    <div className="relative">
      <input 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="Enter item name"
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
      />
      
      {showDropdown && filteredItems.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
          {filteredItems.map((item, index) => (
            <div
              key={index}
              className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-100 last:border-b-0"
              onClick={() => {
                onSelectPrevious(item);
                setShowDropdown(false);
              }}
            >
              <div className="font-medium">{item.itemName}</div>
              <div className="text-gray-500 text-xs">{item.description} • ${item.price}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface LineItem {
  id: string;
  itemName: string;
  description: string;
  qty: number;
  price: number;
  discount: number;
  tax: string;
}

interface Preset {
  id: string;
  name: string;
  description?: string;
  unit_amount: number;
  tax_rate?: number;
}

interface LineItemsTableProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  onSetItem: (id: string, key: keyof LineItem, value: any) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onApplyPreset: (id: string, presetId: string) => void;
  presets: Preset[];
  taxMode: string;
  previousItems?: Array<{
    itemName: string;
    description: string;
    price: number;
    tax: string;
  }>;
}

export function LineItemsTable({ 
  items, 
  onChange, 
  onSetItem, 
  onAddRow, 
  onRemoveRow, 
  onApplyPreset, 
  presets, 
  taxMode,
  previousItems = []
}: LineItemsTableProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Desktop Table Header - Hidden on Mobile */}
      <div className="bg-gray-50 border-b border-gray-200 hidden md:block">
        <div className="grid grid-cols-12 gap-4 px-6 py-3">
          <div className="col-span-3 text-sm font-medium text-gray-700">Item</div>
          <div className="col-span-3 text-sm font-medium text-gray-700">Description</div>
          <div className="col-span-1 text-sm font-medium text-gray-700 text-center">Qty</div>
          <div className="col-span-2 text-sm font-medium text-gray-700 text-right">Price</div>
          <div className="col-span-1 text-sm font-medium text-gray-700 text-center">Disc. %</div>
          <div className="col-span-1 text-sm font-medium text-gray-700 text-center">Tax rate</div>
          <div className="col-span-1 text-sm font-medium text-gray-700 text-right">Amount</div>
        </div>
      </div>
      
      {/* Mobile Header */}
      <div className="bg-gray-50 border-b border-gray-200 md:hidden px-4 py-3">
        <div className="text-sm font-medium text-gray-700">Line Items</div>
      </div>

      {/* Table Rows */}
      {items.map((it, index) => {
        const GST = 0.10;
        const base = Number(it.qty || 0) * Number(it.price || 0) * (1 - Number(it.discount || 0) / 100);
        const gst = it.tax === 'GST' ? (taxMode === 'inclusive' ? (base / (1 + GST)) * GST : base * GST) : 0;
        const total = taxMode === 'inclusive' ? base : base + gst;
        
        return (
          <div key={it.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
            {/* Desktop Layout */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4">
              {/* Item Name */}
              <div className="col-span-3">
                <ItemPresetInput 
                  description={it.itemName}
                  setDescription={(value: string) => onSetItem(it.id, 'itemName', value)}
                  unitAmount={it.price}
                  setUnitAmount={(value: number) => onSetItem(it.id, 'price', value)}
                  taxRate={it.tax === 'GST' ? 10 : 0}
                  setTaxRate={(value: number) => onSetItem(it.id, 'tax', value === 10 ? 'GST' : 'None')}
                  autoSave={true}
                />
              </div>
              
              {/* Description */}
              <div className="col-span-3">
                <input 
                  value={it.description} 
                  onChange={(e) => onSetItem(it.id, 'description', e.target.value)} 
                  placeholder="Enter description" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                />
              </div>
              
              {/* Quantity */}
              <div className="col-span-1">
                <input 
                  type="number" 
                  step="1" 
                  min="1"
                  value={it.qty} 
                  onChange={(e) => onSetItem(it.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center" 
                  placeholder="1"
                />
              </div>
              
              {/* Price */}
              <div className="col-span-2">
                <input 
                  type="number" 
                  step="0.01" 
                  min="0"
                  value={it.price} 
                  onChange={(e) => onSetItem(it.id, 'price', Math.max(0, parseFloat(e.target.value) || 0))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-right" 
                  placeholder="0.00"
                />
              </div>
              
              {/* Discount */}
              <div className="col-span-1">
                <input 
                  type="number" 
                  step="0.01" 
                  min="0"
                  max="100"
                  value={it.discount} 
                  onChange={(e) => onSetItem(it.id, 'discount', Math.min(100, Math.max(0, Number(e.target.value))))} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center" 
                  placeholder="0"
                />
              </div>
              
              {/* Tax Rate */}
              <div className="col-span-1">
                <select 
                  value={it.tax} 
                  onChange={(e) => onSetItem(it.id, 'tax', e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="GST">GST (10%)</option>
                  <option value="None">Tax Exempt</option>
                </select>
              </div>
              
              {/* Amount */}
              <div className="col-span-1">
                <div className="px-3 py-2 text-sm font-medium text-gray-900 text-right">
                  {currency(total)}
                </div>
              </div>
            </div>
            
            {/* Mobile Layout */}
            <div className="md:hidden px-4 py-4 space-y-4">
              {/* Item Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Item</label>
                <ItemPresetInput 
                  description={it.itemName}
                  setDescription={(value: string) => onSetItem(it.id, 'itemName', value)}
                  unitAmount={it.price}
                  setUnitAmount={(value: number) => onSetItem(it.id, 'price', value)}
                  taxRate={it.tax === 'GST' ? 10 : 0}
                  setTaxRate={(value: number) => onSetItem(it.id, 'tax', value === 10 ? 'GST' : 'None')}
                  autoSave={true}
                />
              </div>
              
              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <input 
                  value={it.description} 
                  onChange={(e) => onSetItem(it.id, 'description', e.target.value)} 
                  placeholder="Enter description" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                />
              </div>
              
              {/* Quantity and Price Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Qty</label>
                  <input 
                    type="number" 
                    step="1" 
                    min="1"
                    value={it.qty} 
                    onChange={(e) => onSetItem(it.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center" 
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Price</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={it.price} 
                    onChange={(e) => onSetItem(it.id, 'price', Math.max(0, parseFloat(e.target.value) || 0))} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-right" 
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              {/* Discount and Tax Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Discount %</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    max="100"
                    value={it.discount} 
                    onChange={(e) => onSetItem(it.id, 'discount', Math.min(100, Math.max(0, Number(e.target.value))))} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center" 
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tax Rate</label>
                  <select 
                    value={it.tax} 
                    onChange={(e) => onSetItem(it.id, 'tax', e.target.value)} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="GST">GST (10%)</option>
                    <option value="None">Tax Exempt</option>
                  </select>
                </div>
              </div>
              
              {/* Amount Display */}
              <div className="bg-gray-50 px-3 py-2 rounded-md flex justify-between items-center">
                <span className="text-xs font-medium text-gray-700">Amount:</span>
                <span className="text-sm font-bold text-gray-900">{currency(total)}</span>
              </div>
            </div>
            
            {/* Row Actions */}
            {items.length > 1 && (
              <div className="px-4 md:px-6 pb-3 flex items-center justify-end">
                <button 
                  type="button"
                  className="text-sm text-red-600 hover:text-red-800 font-medium" 
                  onClick={() => onRemoveRow(it.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
      
      {/* Add Row Button */}
      <div className="px-4 md:px-6 py-4 border-t border-gray-200 bg-gray-50">
        <button 
          type="button"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          onClick={onAddRow}
        >
          + Add a line
        </button>
      </div>
    </div>
  );
}

function currency(n: number): string {
  const v = isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: 'currency', currency: 'AUD' });
}