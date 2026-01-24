/**
 * CustomersScreen Component
 * 
 * CUSTOMERS tab - displays and manages customer database.
 * - Search customers by name, phone, or email
 * - Filter by customer type (REGULAR, VIP, NEW, INACTIVE, BULK_BUYER, ONLINE)
 * - Add new customer
 * - View customer details
 * - Assign customer to current transaction
 */

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faPlus,
  faPhone,
  faEnvelope,
  faMapPin,
  faTag,
  faX,
} from '@fortawesome/free-solid-svg-icons';
import { useCart } from '../../context/CartContext';

const CUSTOMER_TYPES = ['REGULAR', 'VIP', 'NEW', 'INACTIVE', 'BULK_BUYER', 'ONLINE'];

const CUSTOMER_TYPE_COLORS = {
  VIP: 'bg-purple-100 text-purple-800 border-purple-300',
  REGULAR: 'bg-blue-100 text-blue-800 border-blue-300',
  NEW: 'bg-green-100 text-green-800 border-green-300',
  INACTIVE: 'bg-gray-100 text-gray-800 border-gray-300',
  BULK_BUYER: 'bg-orange-100 text-orange-800 border-orange-300',
  ONLINE: 'bg-cyan-100 text-cyan-800 border-cyan-300',
};

export default function CustomersScreen() {
  const { activeCart } = useCart();
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    type: 'REGULAR',
  });
  const [adding, setAdding] = useState(false);

  // Fetch customers on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(Array.isArray(data) ? data : data.data || []);
      } else {
        setCustomers([]);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async () => {
    if (!formData.name || !formData.phone) {
      alert('Name and phone are required');
      return;
    }

    try {
      setAdding(true);
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const newCustomer = await response.json();
        setCustomers([...customers, newCustomer]);
        setFormData({
          name: '',
          phone: '',
          email: '',
          address: '',
          type: 'REGULAR',
        });
        setShowAddForm(false);
        alert('Customer added successfully!');
      }
    } catch (error) {
      console.error('Failed to add customer:', error);
      alert('Error adding customer');
    } finally {
      setAdding(false);
    }
  };

  // Filter customers
  const filteredCustomers = customers.filter(customer => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.phone && customer.phone.includes(searchTerm)) ||
      (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType = selectedType ? customer.type === selectedType : true;

    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header with Search and Add Button */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="flex gap-3 mb-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>

          {/* Add Customer Button */}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faPlus} className="w-5 h-5" />
            <span className="hidden sm:inline">Add Customer</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* Filter by Type */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedType('')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedType === ''
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All Types
          </button>
          {CUSTOMER_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === type
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Add Customer Form */}
      {showAddForm && (
        <div className="bg-blue-50 border-b border-blue-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CUSTOMER_TYPES.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCustomer}
              disabled={adding}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
            >
              {adding ? 'Adding...' : 'Add Customer'}
            </button>
          </div>
        </div>
      )}

      {/* Customers List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-3xl mb-2">⏳</div>
              <div className="text-gray-500">Loading customers...</div>
            </div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-2">👥</div>
              <div className="text-gray-500">No customers found</div>
              {searchTerm && (
                <div className="text-sm text-gray-400 mt-1">
                  Try adjusting your search
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filteredCustomers.map(customer => (
              <div
                key={customer._id}
                className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-4"
              >
                {/* Customer Type Badge */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-base line-clamp-1">
                      {customer.name}
                    </h3>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold border ${
                      CUSTOMER_TYPE_COLORS[customer.type] || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {customer.type}
                  </span>
                </div>

                {/* Contact Info */}
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  {customer.phone && (
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faPhone} className="w-4 h-4 text-blue-500" />
                      <span className="font-mono">{customer.phone}</span>
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4 text-blue-500" />
                      <span className="truncate text-xs">{customer.email}</span>
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-start gap-2">
                      <FontAwesomeIcon icon={faMapPin} className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span className="text-xs line-clamp-2">{customer.address}</span>
                    </div>
                  )}
                </div>

                {/* Join Date */}
                {customer.createdAt && (
                  <div className="text-xs text-gray-400 border-t border-gray-200 pt-2">
                    Joined: {new Date(customer.createdAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
