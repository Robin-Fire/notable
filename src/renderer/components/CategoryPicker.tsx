import type { Category, Subcategory } from '../../shared/contracts'
export function CategoryPicker({ categories, subcategories, categoryId, subcategoryId, onChange, disabled=false }: {categories:Category[];subcategories:Subcategory[];categoryId:string|null;subcategoryId:string|null;onChange:(categoryId:string|null,subcategoryId:string|null)=>void;disabled?:boolean}) {
  return <div className="category-picker">
    <label>Category<select aria-label="Item category" disabled={disabled} value={categoryId??''} onChange={event=>onChange(event.target.value||null,null)}><option value="">Unassigned</option>{categories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Subcategory<select aria-label="Item subcategory" disabled={disabled||!categoryId} value={subcategoryId??''} onChange={event=>onChange(categoryId,event.target.value||null)}><option value="">No subcategory</option>{subcategories.filter(item=>item.categoryId===categoryId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  </div>
}
