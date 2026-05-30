#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF转换工具 - 使用pdf2docx和pdf2pptx库进行快速转换
"""

import sys
import os
import json
from pathlib import Path

def pdf_to_word(pdf_path, output_path):
    """PDF转Word"""
    try:
        from pdf2docx import Converter
        
        cv = Converter(pdf_path)
        cv.convert(output_path)
        cv.close()
        return True, None
    except Exception as e:
        return False, str(e)

def pdf_to_ppt(pdf_path, output_path):
    """PDF转PPT - 使用替代方案：PDF每页转为图片，然后创建PPTX"""
    try:
        # 首先尝试使用pdf2pptx（如果可用）
        try:
            from pdf2pptx import Converter
            cv = Converter(pdf_path)
            cv.convert(output_path)
            cv.close()
            return True, None
        except ImportError:
            # 如果pdf2pptx不可用，使用替代方案：PDF转图片，然后创建PPTX
            try:
                from pdf2image import convert_from_path
                from pptx import Presentation
                from pptx.util import Inches
                import tempfile
                import shutil
                import os
                
                # Poppler路径配置（Windows/Linux自动检测）
                # 先尝试在系统PATH中查找，如果没有再指定路径
                poppler_path = None
                # 常见的poppler安装位置
                possible_paths = [
                    r"C:\Program Files\poppler\Library\bin",
                    r"C:\Program Files (x86)\poppler\Library\bin",
                    r"D:\poppler\Library\bin",
                ]
                for path in possible_paths:
                    if os.path.exists(path):
                        poppler_path = path
                        break
                # 如果都不存在，尝试环境变量或让pdf2image自动查找
                if not poppler_path:
                    poppler_path = None
                
                # 创建临时目录存储图片
                temp_dir = tempfile.mkdtemp()
                
                try:
                    # 将PDF转换为图片（每页一张，DPI=150）
                    if poppler_path:
                        images = convert_from_path(pdf_path, dpi=150, output_folder=temp_dir, fmt='png', poppler_path=poppler_path)
                    else:
                        images = convert_from_path(pdf_path, dpi=150, output_folder=temp_dir, fmt='png')
                    
                    if not images:
                        return False, "PDF中没有找到页面"
                    
                    # 创建PPTX演示文稿
                    prs = Presentation()
                    prs.slide_width = Inches(10)
                    prs.slide_height = Inches(7.5)
                    
                    # 为每页PDF创建一张幻灯片
                    for i, img in enumerate(images):
                        slide = prs.slides.add_slide(prs.slide_layouts[6])  # 空白布局
                        
                        # 保存图片到临时文件
                        img_path = os.path.join(temp_dir, f'page_{i+1}.png')
                        img.save(img_path, 'PNG')
                        
                        # 添加图片到幻灯片（填充整个幻灯片）
                        left = top = 0
                        slide.shapes.add_picture(img_path, left, top, width=prs.slide_width, height=prs.slide_height)
                    
                    # 保存PPTX
                    prs.save(output_path)
                    
                    # 清理临时文件
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    
                    return True, None
                except Exception as e:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    raise
            except ImportError as e:
                return False, f"缺少必要的库: {str(e)}。请安装: pip install pdf2image python-pptx pillow"
    except Exception as e:
        return False, str(e)

def main():
    if len(sys.argv) < 4:
        print(json.dumps({
            "success": False,
            "error": "参数不足，需要: convert_type pdf_path output_path"
        }))
        sys.exit(1)
    
    convert_type = sys.argv[1]  # 'word' 或 'ppt'
    pdf_path = sys.argv[2]
    output_path = sys.argv[3]
    
    # 检查PDF文件是否存在
    if not os.path.exists(pdf_path):
        print(json.dumps({
            "success": False,
            "error": f"PDF文件不存在: {pdf_path}"
        }))
        sys.exit(1)
    
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    # 执行转换
    if convert_type == 'word':
        success, error = pdf_to_word(pdf_path, output_path)
    elif convert_type == 'ppt':
        success, error = pdf_to_ppt(pdf_path, output_path)
    else:
        print(json.dumps({
            "success": False,
            "error": f"不支持的转换类型: {convert_type}，支持的类型: word, ppt"
        }))
        sys.exit(1)
    
    if success:
        if os.path.exists(output_path):
            print(json.dumps({
                "success": True,
                "output_path": output_path,
                "file_size": os.path.getsize(output_path)
            }))
        else:
            print(json.dumps({
                "success": False,
                "error": "转换完成但输出文件不存在"
            }))
    else:
        print(json.dumps({
            "success": False,
            "error": error
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()

