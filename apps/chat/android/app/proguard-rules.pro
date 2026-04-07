# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.clawjs.chat.**$$serializer { *; }
-keepclassmembers class com.clawjs.chat.** { *** Companion; }
-keepclasseswithmembers class com.clawjs.chat.** { kotlinx.serialization.KSerializer serializer(...); }
