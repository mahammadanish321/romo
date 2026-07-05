import os
from PIL import Image, ImageDraw, ImageFont

def main():
    # Load Segoe UI Bold from Windows Fonts folder
    font_path = r"C:\Windows\Fonts\segoeuib.ttf"
    if not os.path.exists(font_path):
        font_path = None  # fallback to PIL default

    def get_font(size):
        if font_path:
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                pass
        return ImageFont.load_default()

    # 1. Generate full logo: "remo" with green dot
    # Size: 240x80, transparent background
    img_logo = Image.new("RGBA", (240, 80), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img_logo)
    
    font = get_font(42)
    text = "remo"
    
    # Get bounding box to position elements perfectly
    bbox = draw.textbbox((15, 12), text, font=font)
    
    # Draw "remo" text with dark charcoal color (#2D3436)
    draw.text((15, 12), text, fill=(230, 234, 238, 255), font=font) # Light theme logo color for dark GUI
    
    # Draw glowing brand green dot next to the "o"
    dot_center_x = bbox[2] + 16
    dot_center_y = (bbox[1] + bbox[3]) / 2
    dot_radius = 6
    
    # Draw green circle (#2ECC71)
    draw.ellipse(
        [dot_center_x - dot_radius, dot_center_y - dot_radius, dot_center_x + dot_radius, dot_center_y + dot_radius],
        fill=(85, 230, 193, 255) # matching mobile brand green (#55E6C1)
    )
    
    img_logo.save("logo_full.png")
    print("Saved logo_full.png")
    
    # 2. Generate a darker version for light backgrounds (e.g. README)
    img_logo_dark = Image.new("RGBA", (240, 80), (255, 255, 255, 0))
    draw_dark = ImageDraw.Draw(img_logo_dark)
    draw_dark.text((15, 12), text, fill=(45, 52, 70, 255), font=font)
    draw_dark.ellipse(
        [dot_center_x - dot_radius, dot_center_y - dot_radius, dot_center_x + dot_radius, dot_center_y + dot_radius],
        fill=(46, 204, 113, 255)
    )
    img_logo_dark.save("logo_readme.png")
    print("Saved logo_readme.png")
    
    # 3. Generate tray icons: "r" with green/red dot
    # Size: 32x32, transparent background (standard Windows tray icon size)
    def generate_tray_icon(filename, dot_color):
        img = Image.new("RGBA", (32, 32), (255, 255, 255, 0))
        draw = ImageDraw.Draw(img)
        
        font_r = get_font(22)
        
        # Draw "r"
        draw.text((4, 0), "r", fill=(230, 234, 238, 255), font=font_r)
        
        # Draw status dot
        draw.ellipse([20, 18, 28, 26], fill=dot_color)
        
        img.save(filename)
        print(f"Saved {filename}")
        
    generate_tray_icon("tray_connected.png", (85, 230, 193, 255))
    generate_tray_icon("tray_disconnected.png", (255, 118, 117, 255))

if __name__ == "__main__":
    main()
