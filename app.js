const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
app.use(express.json());

// Connect to MySQL using Sequelize
const sequelize = new Sequelize('ecommerce_db', 'root', 'deeksha', {
  host: 'localhost',
  dialect: 'mysql',
});

// Define Models
const User = sequelize.define('User', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: true },
});

const Product = sequelize.define('Product', {
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.FLOAT, allowNull: false },
  category: { type: DataTypes.STRING, allowNull: false },
});

const Cart = sequelize.define('Cart', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
});

const CartItem = sequelize.define('CartItem', {
  cartId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
});

const Order = sequelize.define('Order', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  total: { type: DataTypes.FLOAT, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: false },
});

// Define Associations
User.hasOne(Cart, { foreignKey: 'userId' });
Cart.belongsTo(User, { foreignKey: 'userId' });

Cart.hasMany(CartItem, { foreignKey: 'cartId' });
CartItem.belongsTo(Cart, { foreignKey: 'cartId' });

Product.hasMany(CartItem, { foreignKey: 'productId' });
CartItem.belongsTo(Product, { foreignKey: 'productId' });

User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });

// Utility Functions
const validateEmail = (email) => Joi.string().email().validate(email).error === undefined;
const validatePassword = (password) => Joi.string().min(6).validate(password).error === undefined;
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    req.user = jwt.verify(token, 'secretKey');
    next();
  } catch {
    res.status(400).json({ error: 'Invalid token' });
  }
};

// Authentication Endpoints
app.post('/signup', async (req, res) => {
  const { name, email, password, address } = req.body;
  if (!validateEmail(email) || !validatePassword(password)) return res.status(400).json({ error: 'Invalid input' });

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) return res.status(409).json({ error: 'Email already registered' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hashedPassword, address });
  res.json({ message: 'User registered', userId: user.id });
});

app.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });
  if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id }, 'secretKey');
  res.json({ message: 'Logged in', token });
});

// Product Management Endpoints
app.post('/addproduct', authenticateToken, async (req, res) => {
  const { name, description, price, category } = req.body;
  if (!name || !description || !price || price <= 0) return res.status(400).json({ error: 'Invalid input' });

  const product = await Product.create({ name, description, price, category });
  res.json({ message: 'Product added', productId: product.id });
});

app.put('/updateproduct/:productId', authenticateToken, async (req, res) => {
  const { productId } = req.params;
  const { name, description, price, category } = req.body;

  const product = await Product.findByPk(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  await product.update({ name, description, price, category });
  res.json({ message: 'Product updated' });
});

app.delete('/deleteproduct/:productId', authenticateToken, async (req, res) => {
  const { productId } = req.params;
  const product = await Product.destroy({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  res.json({ message: 'Product deleted' });
});

app.get('/products', async (req, res) => {
  const products = await Product.findAll();
  res.json(products);
});

// Cart Management Endpoints
app.post('/cart/add', authenticateToken, async (req, res) => {
  const { productId, quantity } = req.body;
  const product = await Product.findByPk(productId);
  if (!product || quantity <= 0) return res.status(400).json({ error: 'Invalid input' });

  let cart = await Cart.findOne({ where: { userId: req.user.id } });
  if (!cart) cart = await Cart.create({ userId: req.user.id });

  let cartItem = await CartItem.findOne({ where: { cartId: cart.id, productId } });
  if (cartItem) {
    cartItem.quantity += quantity;
    await cartItem.save();
  } else {
    await CartItem.create({ cartId: cart.id, productId, quantity });
  }

  res.json({ message: 'Product added to cart' });
});

app.put('/cart/update', authenticateToken, async (req, res) => {
  const { productId, quantity } = req.body;
  const cart = await Cart.findOne({ where: { userId: req.user.id } });
  if (!cart) return res.status(404).json({ error: 'Cart not found' });

  let cartItem = await CartItem.findOne({ where: { cartId: cart.id, productId } });
  if (!cartItem) return res.status(404).json({ error: 'Product not in cart' });

  if (quantity === 0) await cartItem.destroy();
  else cartItem.quantity = quantity;
  
  await cartItem.save();
  res.json({ message: 'Cart updated' });
});

app.delete('/cart/delete', authenticateToken, async (req, res) => {
  const { productId } = req.body;
  const cart = await Cart.findOne({ where: { userId: req.user.id } });
  if (!cart) return res.status(404).json({ error: 'Cart not found' });

  const cartItem = await CartItem.destroy({ where: { cartId: cart.id, productId } });
  res.json({ message: 'Product removed from cart' });
});

app.get('/cart', authenticateToken, async (req, res) => {
  const cart = await Cart.findOne({ where: { userId: req.user.id }, include: [CartItem] });
  if (!cart) return res.status(404).json({ error: 'Cart is empty' });
  res.json(cart);
});

// Order Management Endpoints
app.post('/placeorder', authenticateToken, async (req, res) => {
  const cart = await Cart.findOne({ where: { userId: req.user.id }, include: [CartItem] });
  if (!cart || cart.CartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  const total = cart.CartItems.reduce((sum, item) => sum + item.Product.price * item.quantity, 0);
  const order = await Order.create({ userId: req.user.id, total, address: req.body.address });
  await CartItem.destroy({ where: { cartId: cart.id } });

  res.json({ message: 'Order placed', orderId: order.id });
});

app.get('/getallorders', authenticateToken, async (req, res) => {
  const orders = await Order.findAll({ include: [User] });
  res.json(orders);
});

app.get('/orders/customer/:customerId', authenticateToken, async (req, res) => {
  const orders = await Order.findAll({ where: { userId: req.params.customerId }, include: [User] });
  res.json(orders);
});

// Sync Models and Start Server
sequelize.sync().then(() => {
  app.listen(3000, () => console.log('Server is running on port 3000'));
});
