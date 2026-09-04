# 🎨 Tailwind CSS + DaisyUI Guide

## ✅ Setup Complete!

Tailwind CSS and DaisyUI are now installed and configured.

---

## 📚 Quick Reference

### **DaisyUI Components** (Pre-built, ready to use)

#### **Buttons**
```tsx
<button className="btn">Normal</button>
<button className="btn btn-primary">Primary</button>
<button className="btn btn-secondary">Secondary</button>
<button className="btn btn-success">Success</button>
<button className="btn btn-error">Danger</button>
<button className="btn btn-ghost">Ghost</button>
<button className="btn btn-lg">Large</button>
<button className="btn btn-sm">Small</button>
<button className="btn btn-wide">Wide</button>
<button className="btn btn-block">Full Width</button>
<button className="btn" disabled>Disabled</button>
```

#### **Cards**
```tsx
<div className="card bg-base-100 shadow-xl">
  <div className="card-body">
    <h2 className="card-title">Card Title</h2>
    <p>Card content</p>
    <div className="card-actions justify-end">
      <button className="btn btn-primary">Action</button>
    </div>
  </div>
</div>
```

#### **Tabs**
```tsx
<div className="tabs tabs-boxed">
  <a className="tab">Tab 1</a>
  <a className="tab tab-active">Tab 2</a>
  <a className="tab">Tab 3</a>
</div>
```

#### **Forms**
```tsx
<input type="text" placeholder="Type here" className="input input-bordered w-full" />
<input type="text" className="input input-primary" />
<input type="text" className="input input-error" />

<select className="select select-bordered w-full">
  <option>Pick one</option>
  <option>Option 1</option>
</select>

<textarea className="textarea textarea-bordered" placeholder="Bio"></textarea>

<label className="label cursor-pointer">
  <span className="label-text">Remember me</span>
  <input type="checkbox" className="checkbox" />
</label>
```

#### **Alerts**
```tsx
<div className="alert alert-info">
  <span>Info alert</span>
</div>
<div className="alert alert-success">
  <span>Success alert</span>
</div>
<div className="alert alert-warning">
  <span>Warning alert</span>
</div>
<div className="alert alert-error">
  <span>Error alert</span>
</div>
```

#### **Badges**
```tsx
<div className="badge">Neutral</div>
<div className="badge badge-primary">Primary</div>
<div className="badge badge-secondary">Secondary</div>
<div className="badge badge-success">Success</div>
<div className="badge badge-error">Error</div>
<div className="badge badge-lg">Large</div>
```

#### **Stats**
```tsx
<div className="stats shadow">
  <div className="stat">
    <div className="stat-title">Total Sales</div>
    <div className="stat-value">25.6K</div>
    <div className="stat-desc">21% more than last month</div>
  </div>
</div>
```

#### **Modal**
```tsx
<dialog id="my_modal" className="modal">
  <div className="modal-box">
    <h3 className="font-bold text-lg">Hello!</h3>
    <p className="py-4">Modal content</p>
    <div className="modal-action">
      <form method="dialog">
        <button className="btn">Close</button>
      </form>
    </div>
  </div>
</dialog>

{/* Open with: document.getElementById('my_modal').showModal() */}
```

---

### **Tailwind Utility Classes**

#### **Spacing**
```tsx
p-4      // padding: 1rem (16px)
px-4     // padding left & right
py-4     // padding top & bottom
m-4      // margin
gap-4    // gap in flex/grid
```

#### **Layout**
```tsx
flex                    // display: flex
grid                    // display: grid
grid-cols-2            // 2 columns
grid-cols-3            // 3 columns
grid-cols-4            // 4 columns
w-full                 // width: 100%
h-screen               // height: 100vh
max-w-md               // max-width: 448px
mx-auto                // margin: 0 auto
```

#### **Colors**
```tsx
bg-base-100            // background
text-primary           // text color
border-primary         // border color
```

#### **Typography**
```tsx
text-sm                // 14px
text-base              // 16px
text-lg                // 18px
text-xl                // 20px
text-2xl               // 24px
font-bold              // font-weight: 700
font-semibold          // font-weight: 600
```

#### **Borders & Shadows**
```tsx
rounded                // border-radius: 0.25rem
rounded-lg             // larger radius
shadow                 // box-shadow
shadow-xl              // larger shadow
border                 // border: 1px
border-2               // border: 2px
```

---

## 🔄 Migration Pattern

### **Old Custom CSS**
```tsx
<div className="panel">
  <h2 className="panel-header">Title</h2>
  <button className="primary">Submit</button>
</div>
```

### **New Tailwind + DaisyUI**
```tsx
<div className="card bg-base-100 shadow-xl">
  <div className="card-body">
    <h2 className="card-title">Title</h2>
    <button className="btn btn-primary">Submit</button>
  </div>
</div>
```

---

## 🎨 Your Custom Theme

Your app uses a **green theme** matching your POS brand:
- Primary: Green (#16a34a)
- Background: Light stone
- Accent: Success green

---

## 📖 Resources

- **DaisyUI Components**: https://daisyui.com/components/
- **Tailwind Docs**: https://tailwindcss.com/docs
- **Tailwind Cheatsheet**: https://nerdcave.com/tailwind-cheat-sheet

---

## 🚀 Next Steps

1. **Gradually migrate components** - Start with simple ones
2. **Use DaisyUI components** - They're pre-styled and accessible
3. **Customize as needed** - Tailwind classes for fine-tuning

The old CSS files are still there if you need reference!
