import { useState, useEffect } from 'react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL, getErrorMessage } from '../services/api';
import './SustainableProducts.css';
import {
    FaLeaf,
    FaShoppingBag,
    FaCoins,
    FaSearch,
    FaShoppingCart,
    FaStar,
    FaTag,
    FaHeart,
    FaShare,
    FaEye
} from 'react-icons/fa';

interface ApiProduct {
    _id: string;
    productName: string;
    description: string;
    price: number;
    originalPrice?: number;
    category: string;
    productImage?: string;
    stockQuantity?: number;
    isActive?: boolean;
    tags?: string[];
    fastDelivery?: boolean;
}

interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    originalPrice?: number;
    category: string;
    image: string;
    tags: string[];
    inStock: boolean;
    fastDelivery: boolean;
}

interface SustainableProductsProps {
    userCoins?: number;
}

const SustainableProducts: React.FC<SustainableProductsProps> = ({ userCoins: propCoins }) => {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [wishlist, setWishlist] = useState<string[]>([]);

    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { addToCart } = useCart();

    const userCoins = propCoins ?? user?.points ?? 0;

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/products`);
                const data = await response.json();
    
                if (!response.ok) throw new Error(data.message || 'Failed to fetch products');
    
                // Map backend fields to your frontend Product interface
                // Deactivated products are hidden; stock comes from the real stockQuantity
                const formattedProducts: Product[] = data.products
                    .filter((p: ApiProduct) => p.isActive !== false)
                    .map((p: ApiProduct) => ({
                    id: p._id,
                    name: p.productName,
                    description: p.description,
                    price: p.price,
                    originalPrice: p.originalPrice,
                    category: p.category,
                    image: p.productImage || '',
                    tags: p.tags ?? [],
                    inStock: Number(p.stockQuantity) > 0,
                    fastDelivery: p.fastDelivery ?? false,
                }));
    
                setProducts(formattedProducts);
            } catch (err) {
                console.error(err);
                setError(getErrorMessage(err, 'Could not load products.'));
            } finally {
                setLoading(false);
            }
        };
    
        fetchProducts();
    }, []);
    

    const categories = ['all', 'Personal Care', 'Kitchen', 'Fashion', 'Electronics', 'Home'];

    // Stats data matching dashboard
    const productStats = {
        totalProducts: products.length,
        affordableProducts: products.filter(p => p.price <= userCoins).length,
        inStock: products.filter(p => p.inStock).length,
        categories: new Set(products.map(p => p.category)).size,
        cheapest: products.length > 0 ? Math.min(...products.map(p => p.price)) : 0

    };

    const filteredProducts = products.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            product.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            product.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
                            const matchesCategory =
                            categoryFilter === 'all' ||
                            product.category.toLowerCase() === categoryFilter.toLowerCase();                          
        return matchesSearch && matchesCategory;
    });

    // Navigation to /redeem is handled via Link in the CTA button.

    const toggleWishlist = (productId: string) => {
        setWishlist(prev => 
            prev.includes(productId) 
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        );
    };
    

    const getDiscount = (originalPrice: number, price: number) => {
        return Math.round(((originalPrice - price) / originalPrice) * 100);
    };

    return (
        <div className="sustainable-products-page">
            {loading && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#ffcc00' }}>
                    <p>Loading eco products...</p>
                </div>
            )}
            {error && (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#ff5252', background: 'rgba(255,82,82,0.1)', borderRadius: '8px', margin: '1rem 0' }}>
                    <p>{error}</p>
                </div>
            )}
           

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">
                        <FaShoppingBag />
                    </div>
                    <div className="stat-content">
                        <h3>{productStats.totalProducts}</h3>
                        <p>Available Products</p>
                        <span className="stat-trend positive">{productStats.inStock} in stock</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">
                        <FaCoins />
                    </div>
                    <div className="stat-content">
                        <h3>{productStats.affordableProducts}</h3>
                        <p>Products You Can Afford</p>
                        <span className="stat-trend positive">With your {userCoins} coins</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">
                        <FaStar />
                    </div>
                    <div className="stat-content">
                        <h3>{productStats.categories}</h3>
                        <p>Categories</p>
                        <span className="stat-trend positive">Across the store</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">
                        <FaLeaf />
                    </div>
                    <div className="stat-content">
                        <h3>{productStats.cheapest}</h3>
                        <p>Cheapest Item (coins)</p>
                        <span className="stat-trend positive">Start redeeming</span>
                    </div>
                </div>
            </div>

            {/* Search and Filter */}
            <div className="products-controls">
                <div className="search-container">
                    <FaSearch className="search-icon" />
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search sustainable products..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="filter-container">
                   
                    <select
                        className="filter-select"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        {categories.map(category => (
                            <option key={category} value={category}>
                                {category === 'all' ? 'All Categories' : category}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Products Grid */}
            <div className="products-grid">
                {filteredProducts.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🌿</div>
                        <h3>No products found</h3>
                        <p>Try adjusting your search or filter criteria</p>
                    </div>
                ) : (
                    filteredProducts.map((product) => (
                        <div key={product.id} className="product-card">
                            <div className="product-image-container">
                                <div className="productImage">
                                    <img src={product.image} alt={product.name} />
                                    <div className="image-overlay">
                                        <button 
                                            className={`wishlist-btn ${wishlist.includes(product.id) ? 'active' : ''}`}
                                            onClick={() => toggleWishlist(product.id)}
                                        >
                                            <FaHeart />
                                        </button>
                                        <button className="quick-view-btn">
                                            <FaEye />
                                        </button>
                                        <button className="share-btn">
                                            <FaShare />
                                        </button>
                                    </div>
                                    {product.originalPrice && (
                                        <div className="discount-badge">
                                            -{getDiscount(product.originalPrice, product.price)}%
                                        </div>
                                    )}
                                </div>
                                <div className="product-badges">
                                    {product.fastDelivery && (
                                        <span className="badge delivery-badge">Fast Delivery</span>
                                    )}
                                    {!product.inStock && (
                                        <span className="badge out-of-stock">Out of Stock</span>
                                    )}
                                </div>
                            </div>

                            <div className="product-content">
                                <div className="product-header-1">
                                    <h3 className="product-name">{product.name}</h3>
                                    <div className="product-price-section">
                                        {product.originalPrice && (
                                            <span className="original-price">{product.originalPrice} coins</span>
                                        )}
                                        <div className="product-price">
                                            <FaCoins className="price-icon" />
                                            <span className="price-amount">{product.price}</span>
                                        </div>
                                    </div>
                                </div>

                                <p className="product-description">{product.description}</p>

                                <div className="product-meta">
                                    
                                    <div className="product-category">
                                        <FaTag className="category-icon" />
                                        <span>{product.category}</span>
                                    </div>
                                </div>

                                <div className="product-tags">
                                    {product.tags.map((tag, index) => (
                                        <span key={index} className="product-tag">#{tag}</span>
                                    ))}
                                </div>

                                <div className="product-actions">
                                    <div className="price-cta">
                                        <div className="product-price-inline">
                                            <FaCoins className="price-coin" />
                                            <span className="price-amount-inline">{product.price}</span>
                                        </div>

                                        <button
                                            className={`add-cart-btn ${!product.inStock ? 'disabled' : ''}`}
                                            onClick={() => product.inStock && addToCart({ id: product.id, name: product.name, price: product.price, image: product.image })}
                                            disabled={!product.inStock}
                                            title={product.inStock ? 'Add to cart' : 'Out of stock'}
                                        >
                                            <FaShoppingCart className="btn-icon" />
                                            {product.inStock ? 'Add to Cart' : 'Out of Stock'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* How to Earn Section */}
            <div className="earn-coins-section">
                <h2 className="section-title">How to Earn More Eco Coins</h2>
                <div className="earn-methods">
                    <div className="earn-method">
                        <div className="method-icon">♻️</div>
                        <h4>Recycle & Earn</h4>
                        <p>10-50 coins per pickup • Bonus for electronics</p>
                        <span className="method-bonus">+25% this month</span>
                    </div>
                    <div className="earn-method">
                        <div className="method-icon">🏆</div>
                        <h4>Complete Challenges</h4>
                        <p>Weekly eco-challenges • 100-500 coins each</p>
                        <span className="method-bonus">3 active now</span>
                    </div>
                    <div className="earn-method">
                        <div className="method-icon">👥</div>
                        <h4>Refer Friends</h4>
                        <p>100 coins per friend • 50 coins when they recycle</p>
                        <span className="method-bonus">Most popular</span>
                    </div>
                    <div className="earn-method">
                        <div className="method-icon">💡</div>
                        <h4>Eco Tips & Feedback</h4>
                        <p>Share suggestions • Review products • 25 coins each</p>
                        <span className="method-bonus">Easy coins</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SustainableProducts;