import { useState, useEffect, useRef } from 'react';
import './ProductManagement.css';
import { API_BASE_URL, getAuthToken, getErrorMessage } from '../services/api';
import { FaPlus, FaEdit, FaTrash, FaImage, FaRupeeSign } from 'react-icons/fa';
interface ApiProduct {
    _id: string;
    productName: string;
    description: string;
    price: number;
    coinsRequired: number;
    category: string;
    productImage?: string;
    stockQuantity: number;
    isActive?: boolean;
}

interface Product {
    id: string; // changed from number to string
    name: string;
    description: string;
    price: number;
    coins: number;
    category: string;
    image: string;
    stock: number;
    isActive: boolean;
}

const ProductManagement = () => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [products, setProducts] = useState<Product[]>([]);

    const [showAddForm, setShowAddForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<{
        name: string;
        description: string;
        price: number;
        coins: number;
        category: string;
        stock: number;
        imageFile: File | null; // correct typing
      }>({
        name: '',
        description: '',
        price: 0,
        coins: 0,
        category: '',
        stock: 0,
        imageFile: null,
      });
      
    const fetchProducts = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/products`); // your GET route
            const data = await res.json();
    
            if (!res.ok) throw new Error(data.message || 'Failed to fetch products');
    
            // Map backend fields to frontend Product interface
            const mappedProducts: Product[] = data.products.map((p: ApiProduct) => ({
                id: p._id,  // assuming MongoDB _id
                name: p.productName,
                description: p.description,
                price: p.price,
                coins: p.coinsRequired,
                category: p.category,
                image: p.productImage || '',
                stock: p.stockQuantity,
                isActive: p.isActive ?? true
            }));
    
            setProducts(mappedProducts);
        } catch (err) {
            console.error('Error fetching products:', getErrorMessage(err));
        }
    };
    useEffect(() => {
        fetchProducts();
    }, []);
    const categories = ['Lifestyle', 'Personal Care', 'Fashion', 'Home', 'Electronics', 'Other'];

    
      const handleAddProduct = async (e: React.FormEvent) => {
        e.preventDefault();
      
        const formPayload = new FormData();
        formPayload.append('productName', formData.name);
        formPayload.append('description', formData.description);
        formPayload.append('price', formData.price.toString());
        formPayload.append('coinsRequired', formData.coins.toString());
        formPayload.append('category', formData.category);
        formPayload.append('stockQuantity', formData.stock.toString());
      
        // if you add file input for image
        if (formData.imageFile) {
          formPayload.append('productImage', formData.imageFile);
        }
      
        try {
          const res = await fetch(`${API_BASE_URL}/api/products`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getAuthToken()}` },
            body: formPayload, // multipart/form-data
          });
      
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Failed to create product');
      
          const newProduct: Product = {
            id: data.product._id,
            name: data.product.productName,
            description: data.product.description,
            price: data.product.price,
            coins: data.product.coinsRequired,
            category: data.product.category,
            image: data.product.productImage || '',
            stock: data.product.stockQuantity,
            isActive: data.product.isActive ?? true,
          };
          
          setProducts(prev => [...prev, newProduct]);
          
          setFormData({ name: '', description: '', price: 0, coins: 0, category: '', stock: 0,imageFile: null });
          setShowAddForm(false);
        } catch (err) {
          alert(getErrorMessage(err, 'Could not create the product.'));
        }
      };
      
      const handleEditProduct = (product: Product) => {
        setEditingProduct(product); // mark this product as being edited
        setFormData({
            name: product.name,
            description: product.description,
            price: product.price,
            coins: product.coins,
            category: product.category,
            stock: product.stock,
            imageFile: null // optional: user can upload a new image
        });
        setShowAddForm(true); // open the form overlay
    };
    
    
    

    const handleUpdateProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProduct) return;
      
        const formPayload = new FormData();
        formPayload.append('productName', formData.name);
        formPayload.append('description', formData.description);
        formPayload.append('price', formData.price.toString());
        formPayload.append('coinsRequired', formData.coins.toString());
        formPayload.append('category', formData.category);
        formPayload.append('stockQuantity', formData.stock.toString());
      
        if (formData.imageFile) {
            formPayload.append('productImage', formData.imageFile);
        }
      
        try {
            const res = await fetch(`${API_BASE_URL}/api/products/update/${editingProduct.id}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${getAuthToken()}` },
                body: formPayload
            });
      
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to update product');
      
            // ✅ Map backend product to frontend format
            const updatedProduct: Product = {
                id: data.product._id,
                name: data.product.productName,
                description: data.product.description,
                price: data.product.price,
                coins: data.product.coinsRequired,
                category: data.product.category,
                image: data.product.productImage || '',
                stock: data.product.stockQuantity,
                isActive: data.product.isActive ?? true
            };
      
            // ✅ Update local state
            setProducts(prev =>
                prev.map(p => (p.id === updatedProduct.id ? updatedProduct : p))
            );
      
            setEditingProduct(null);
            setFormData({
                name: '',
                description: '',
                price: 0,
                coins: 0,
                category: '',
                stock: 0,
                imageFile: null
            });
            setShowAddForm(false);
        } catch (err) {
            alert(getErrorMessage(err, 'Could not update the product.'));
        }
    };
    

// Function to delete a product from backend
const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
  
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/delete/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
  
      const data = await res.json();
  
      if (!res.ok) throw new Error(data.message || 'Failed to delete product');
  
      // Remove the deleted product from local state
      setProducts(prevProducts => prevProducts.filter(p => p.id !== productId));
  
    } catch (err) {
      alert(getErrorMessage(err, 'Could not delete the product.'));
    }
  };
  
  const toggleProductStatus = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
  
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/status/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !product.isActive }),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update status');
  
      setProducts(prev =>
        prev.map(p => p.id === productId ? { ...p, isActive: !p.isActive } : p)
      );
    } catch (err) {
      alert(getErrorMessage(err, 'Could not change the product status.'));
    }
  };
  
    const totalProducts = products.length;
    const activeProducts = products.filter(p => p.isActive).length;
    const outOfStockProducts = products.filter(p => p.stock === 0).length;

    return (
        <div className="product-management">
            <div className="product-header">
                <div className="header-content">
                    <h2>Eco Store Products</h2>
                    <p>Manage products available in the eco store for users to purchase with coins</p>
                </div>
                <button 
                    className="btn btn-success"
                    onClick={() => {
                        setEditingProduct(null);
                        setFormData({ name: '', description: '', price: 0, coins: 0, category: '', stock: 0, imageFile: null });
                        setShowAddForm(true);
                    }}
                >
                    <FaPlus /> Add New Product
                </button>
            </div>

            {/* Product Stats */}
            <div className="product-stats">
                <div className="product-stat">
                    <div className="stat-number">{totalProducts}</div>
                    <div className="stat-label">Total Products</div>
                </div>
                <div className="product-stat">
                    <div className="stat-number">{activeProducts}</div>
                    <div className="stat-label">Active Products</div>
                </div>
                <div className="product-stat">
                    <div className="stat-number">{outOfStockProducts}</div>
                    <div className="stat-label">Out of Stock</div>
                </div>
                <div className="product-stat">
                    <div className="stat-number">
                        ₹{products.reduce((sum, product) => sum + (product.price * product.stock), 0).toLocaleString()}
                    </div>
                    <div className="stat-label">Inventory Value</div>
                </div>
            </div>

            {/* Add/Edit Product Form */}
            {showAddForm && (
                <div className="product-form-overlay">
                    <div className="product-form">
                        <div className="form-header">
                            <h3>{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                            <button 
                                className="close-btn"
                                onClick={() => setShowAddForm(false)}
                            >
                                ×
                            </button>
                        </div>
                        <form onSubmit={editingProduct ? handleUpdateProduct : handleAddProduct}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Product Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={e => setFormData({...formData, category: e.target.value})}
                                        required
                                    >
                                        <option value="">Select Category</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group full-width">
                                    <label>Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={e => setFormData({...formData, description: e.target.value})}
                                        rows={3}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Price (₹)</label>
                                    <input
                                        type="number"
                                        value={formData.price}
                                        onChange={e => setFormData({...formData, price: parseInt(e.target.value)})}
                                        min="0"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Coins Required</label>
                                    <input
                                        type="number"
                                        value={formData.coins}
                                        onChange={e => setFormData({...formData, coins: parseInt(e.target.value)})}
                                        min="0"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Stock Quantity</label>
                                    <input
                                        type="number"
                                        value={formData.stock}
                                        onChange={e => setFormData({...formData, stock: parseInt(e.target.value)})}
                                        min="0"
                                        required
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>Product Image</label>
                                    <div
                                        className="image-upload"
                                        onClick={() => fileInputRef.current?.click()}  // 👈 triggers file input
                                        >
                                        <FaImage className="upload-icon" />
                                        <span>{formData.imageFile ? formData.imageFile.name : 'Click to upload product image'}</span>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setFormData(prev => ({ ...prev, imageFile: file }));
                                            }
                                            }}
                                            style={{ display: 'none' }}
                                        />
                                        </div>

                                </div>
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingProduct ? 'Update Product' : 'Add Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Products List */}
            <div className="products-list">
                <div className="table-container">
                    <table className="products-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Category</th>
                                <th>Price</th>
                                <th>Coins</th>
                                <th>Stock</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map(product => (
                                <tr key={product.id} className={!product.isActive ? 'inactive' : ''}>
                                    <td>
                                        <div className="product-info">
                                            <div className="product-image">
                                                {product.image ? (
                                                    <img src={product.image} alt={product.name} />
                                                ) : (
                                                    <FaImage className="placeholder-image" />
                                                )}
                                            </div>
                                            <div className="product-details">
                                                <div className="product-name">{product.name}</div>
                                                <div className="product-desc">{product.description}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="category-badge">{product.category}</span>
                                    </td>
                                    <td>
                                        <div className="price">
                                            <FaRupeeSign /> {product.price}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="coins">
                                            🪙 {product.coins}
                                        </div>
                                    </td>
                                    <td>
                                        <div className={`stock ${product.stock === 0 ? 'out-of-stock' : product.stock < 10 ? 'low-stock' : ''}`}>
                                            {product.stock}
                                        </div>
                                    </td>
                                    <td>
                                        <div className={`status ${product.isActive ? 'active' : 'inactive'}`}>
                                            {product.isActive ? 'Active' : 'Inactive'}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            <button 
                                                className="btn btn-edit"
                                                onClick={() => handleEditProduct(product)}
                                            >
                                                <FaEdit />
                                            </button>
                                            <button 
                                                className="btn btn-delete"
                                                onClick={() => handleDeleteProduct(product.id)}
                                            >
                                                <FaTrash />
                                            </button>
                                            <button 
                                                className={`btn btn-status ${product.isActive ? 'btn-warning' : 'btn-success'}`}
                                                onClick={() => toggleProductStatus(product.id)}
                                            >
                                                {product.isActive ? 'Deactivate' : 'Activate'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProductManagement;