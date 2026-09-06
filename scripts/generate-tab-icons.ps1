Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\miniprogram\assets\tab'
New-Item -ItemType Directory -Force $outputDirectory | Out-Null

function New-Canvas([string]$name, [bool]$filled, [scriptblock]$draw) {
  $bitmap = [System.Drawing.Bitmap]::new(81, 81)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $color = if ($filled) { [System.Drawing.ColorTranslator]::FromHtml('#FF385C') } else { [System.Drawing.ColorTranslator]::FromHtml('#6A6A6A') }
  $pen = [System.Drawing.Pen]::new($color, 5)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $brush = [System.Drawing.SolidBrush]::new($color)
  & $draw $graphics $pen $brush $filled
  $suffix = if ($filled) { 'filled' } else { 'outline' }
  $bitmap.Save((Join-Path $outputDirectory "$name-$suffix.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose()
  $pen.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$recommend = {
  param($g, $pen, $brush, $filled)
  if ($filled) {
    $g.FillPie($brush, 15, 22, 51, 46, 180, 180)
    $g.FillRectangle($brush, 12, 49, 57, 6)
    $g.FillEllipse($brush, 36, 14, 9, 9)
  } else {
    $g.DrawArc($pen, 15, 22, 51, 46, 180, 180)
    $g.DrawLine($pen, 12, 52, 69, 52)
    $g.DrawEllipse($pen, 36, 14, 9, 9)
  }
}

$menu = {
  param($g, $pen, $brush, $filled)
  if ($filled) {
    $g.FillRectangle($brush, 14, 18, 53, 49)
    $cutout = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Transparent)
    $g.DrawLine([System.Drawing.Pen]::new([System.Drawing.Color]::White, 4), 24, 39, 57, 39)
  } else {
    $g.DrawRectangle($pen, 14, 18, 53, 49)
    $g.DrawLine($pen, 14, 35, 67, 35)
  }
  $g.DrawLine($pen, 27, 12, 27, 24)
  $g.DrawLine($pen, 54, 12, 54, 24)
}

$recipes = {
  param($g, $pen, $brush, $filled)
  $left = [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(10, 20),
    [System.Drawing.Point]::new(37, 15),
    [System.Drawing.Point]::new(37, 66),
    [System.Drawing.Point]::new(10, 59)
  )
  $right = [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(44, 15),
    [System.Drawing.Point]::new(71, 20),
    [System.Drawing.Point]::new(71, 59),
    [System.Drawing.Point]::new(44, 66)
  )
  if ($filled) {
    $g.FillPolygon($brush, $left)
    $g.FillPolygon($brush, $right)
  } else {
    $g.DrawPolygon($pen, $left)
    $g.DrawPolygon($pen, $right)
  }
}

$settings = {
  param($g, $pen, $brush, $filled)
  if ($filled) {
    $g.FillEllipse($brush, 15, 15, 51, 51)
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $g.FillEllipse($white, 32, 32, 17, 17)
    $white.Dispose()
  } else {
    $g.DrawEllipse($pen, 15, 15, 51, 51)
    $g.DrawEllipse($pen, 32, 32, 17, 17)
  }
  foreach ($angle in 0,45,90,135,180,225,270,315) {
    $radians = $angle * [Math]::PI / 180
    $x1 = 40.5 + [Math]::Cos($radians) * 27
    $y1 = 40.5 + [Math]::Sin($radians) * 27
    $x2 = 40.5 + [Math]::Cos($radians) * 34
    $y2 = 40.5 + [Math]::Sin($radians) * 34
    $g.DrawLine($pen, $x1, $y1, $x2, $y2)
  }
}

foreach ($entry in @{recommend=$recommend; menu=$menu; recipes=$recipes; settings=$settings}.GetEnumerator()) {
  New-Canvas $entry.Key $false $entry.Value
  New-Canvas $entry.Key $true $entry.Value
}
