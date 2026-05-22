package com.company.analyzer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.BinaryExpr;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import com.github.javaparser.ast.comments.Comment;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class Main {

    public static class ClassInfo {
        public String id;
        public String file;
        public String packageName;
        public String className;
        public String stereotype;
    }

    public static class MethodInfo {
        public String id;
        public String file;
        public String className;
        public String methodName;
        public int line;
    }

    public static class CallInfo {
        public String callerId;
        public String calleeName;
        public String scopeName;
        public String file;
        public int line;
    }

    public static class RouteInfo {
        public String id;
        public String file;
        public String className;
        public String methodName;
        public String httpMethod;
        public String fullPath;
        public int line;
    }

    public static class InjectionInfo {
        public String id;
        public String file;
        public String className;
        public String targetClassName;
        public String fieldName;
        public String injectionType;
    }

    public static class ParseFailure {
        public String file;
        public String errorType;
        public String message;
    }

    public static class TryCatchInfo {
        public String id;
        public String file;
        public String methodId;
        public int line;
        public boolean hasCatchBlock;
        public boolean catchBlockEmpty;
        public boolean hasResources;
    }

    public static class StringConcatInfo {
        public String id;
        public String file;
        public String methodId;
        public int line;
        public String operator; // "+" or "concat"
        public boolean inSqlContext;
        public boolean inCommandContext;
    }

    public static class PreparedStatementInfo {
        public String id;
        public String file;
        public String methodId;
        public int line;
        public boolean usesPreparedStatement;
        public boolean usesParameterization;
    }

    public static class SuppressionInfo {
        public String file;
        public int line;
        public String ruleId;
        public String reason;
    }

    public static class Output {
        public List<ClassInfo> classes = new ArrayList<>();
        public List<MethodInfo> methods = new ArrayList<>();
        public List<CallInfo> calls = new ArrayList<>();
        public List<RouteInfo> routes = new ArrayList<>();
        public List<InjectionInfo> injections = new ArrayList<>();
        public List<ParseFailure> failures = new ArrayList<>();
        public List<TryCatchInfo> tryCatchBlocks = new ArrayList<>();
        public List<StringConcatInfo> stringConcats = new ArrayList<>();
        public List<PreparedStatementInfo> preparedStatements = new ArrayList<>();
        public List<SuppressionInfo> suppressions = new ArrayList<>();
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("Usage: java -jar java-analyzer-1.0.0.jar <repoPath>");
            System.exit(1);
        }

        ParserConfiguration config = new ParserConfiguration();
        config.setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_17);
        StaticJavaParser.setConfiguration(config);

        String repoPath = args[0];
        Output output = new Output();

        Files.walk(Paths.get(repoPath))
                .filter(p -> p.toString().endsWith(".java"))
                .filter(p -> !p.toString().contains("\\target\\"))
                .filter(p -> !p.toString().contains("/target/"))
                .filter(p -> !p.toString().contains("\\build\\"))
                .filter(p -> !p.toString().contains("/build/"))
                .filter(p -> !p.toString().contains("\\generated\\"))
                .filter(p -> !p.toString().contains("/generated/"))
                .filter(p -> !p.toString().contains("\\out\\"))
                .filter(p -> !p.toString().contains("/out/"))
                .forEach(path -> parseFile(repoPath, path.toFile(), output));

        ObjectMapper mapper = new ObjectMapper();
        System.out.println(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(output));
    }

    private static void parseFile(String repoPath, File file, Output output) {
        try {
            CompilationUnit cu = StaticJavaParser.parse(file, StandardCharsets.UTF_8);

            parseClasses(repoPath, file, cu, output);
            parseInjections(repoPath, file, cu, output);
            parseMethodsAndCalls(repoPath, file, cu, output);

        } catch (Throwable e) {
            ParseFailure pf = new ParseFailure();
            pf.file = file.getAbsolutePath();
            pf.errorType = e.getClass().getName();
            pf.message = e.getMessage();
            output.failures.add(pf);

            System.err.println("Failed to parse: " + file.getAbsolutePath());
            System.err.println("Reason: " + pf.errorType + " - " + pf.message);
        }
    }

    private static void parseClasses(String repoPath, File file, CompilationUnit cu, Output output) {
        cu.findAll(ClassOrInterfaceDeclaration.class).forEach(cls -> {
            String className = cls.getNameAsString();
            String packageName = cu.getPackageDeclaration()
                    .map(pd -> pd.getNameAsString())
                    .orElse("");

            ClassInfo ci = new ClassInfo();
            ci.file = relativize(repoPath, file.getAbsolutePath());
            ci.packageName = packageName;
            ci.className = className;
            ci.stereotype = detectStereotype(cls);
            ci.id = ci.file + "#" + ci.className;

            output.classes.add(ci);
        });
    }

    private static void parseInjections(String repoPath, File file, CompilationUnit cu, Output output) {
        cu.findAll(ConstructorDeclaration.class).forEach(ctor -> {
            var classDeclOpt = ctor.findAncestor(ClassOrInterfaceDeclaration.class);
            if (classDeclOpt.isEmpty()) return;

            var classDecl = classDeclOpt.get();
            String className = classDecl.getNameAsString();
            String filePath = relativize(repoPath, file.getAbsolutePath());

            for (var param : ctor.getParameters()) {
                InjectionInfo ii = new InjectionInfo();
                ii.file = filePath;
                ii.className = className;
                ii.targetClassName = param.getType().asString();
                ii.fieldName = param.getNameAsString();
                ii.injectionType = "constructor";
                ii.id = ii.file + "#" + ii.className + "->" + ii.targetClassName + ":" + ii.fieldName;

                output.injections.add(ii);
            }
        });

        cu.findAll(FieldDeclaration.class).forEach(field -> {
            var classDeclOpt = field.findAncestor(ClassOrInterfaceDeclaration.class);
            if (classDeclOpt.isEmpty()) return;
            if (!hasAnnotation(field, "Autowired")) return;

            var classDecl = classDeclOpt.get();
            String className = classDecl.getNameAsString();
            String filePath = relativize(repoPath, file.getAbsolutePath());

            for (var variable : field.getVariables()) {
                InjectionInfo ii = new InjectionInfo();
                ii.file = filePath;
                ii.className = className;
                ii.targetClassName = variable.getType().asString();
                ii.fieldName = variable.getNameAsString();
                ii.injectionType = "field";
                ii.id = ii.file + "#" + ii.className + "->" + ii.targetClassName + ":" + ii.fieldName;

                output.injections.add(ii);
            }
        });
    }

    private static void parseMethodsAndCalls(String repoPath, File file, CompilationUnit cu, Output output) {
        cu.findAll(MethodDeclaration.class).forEach(method -> {
            String className = method.findAncestor(ClassOrInterfaceDeclaration.class)
                    .map(c -> c.getNameAsString())
                    .orElse("UnknownClass");

            String methodName = method.getNameAsString();
            int line = method.getBegin().map(p -> p.line).orElse(-1);

            MethodInfo mi = new MethodInfo();
            mi.file = relativize(repoPath, file.getAbsolutePath());
            mi.className = className;
            mi.methodName = methodName;
            mi.line = line;
            mi.id = mi.file + "#" + mi.className + "." + mi.methodName + "@L" + mi.line;

            output.methods.add(mi);

            method.findAll(MethodCallExpr.class).forEach(call -> {
                CallInfo ci = new CallInfo();
                ci.callerId = mi.id;
                ci.calleeName = call.getNameAsString();
                ci.scopeName = call.getScope().map(Object::toString).orElse(null);
                ci.file = mi.file;
                ci.line = call.getBegin().map(p -> p.line).orElse(-1);
                output.calls.add(ci);
            });

            // Phase 2: Extract try-catch blocks
            method.findAll(com.github.javaparser.ast.stmt.TryStmt.class).forEach(tryStmt -> {
                TryCatchInfo tci = new TryCatchInfo();
                tci.file = mi.file;
                tci.methodId = mi.id;
                tci.line = tryStmt.getBegin().map(p -> p.line).orElse(-1);
                tci.id = tci.file + "#" + tci.methodId + "@try:" + tci.line;

                tci.hasCatchBlock = !tryStmt.getCatchClauses().isEmpty();
                tci.hasResources = !tryStmt.getResources().isEmpty();

                if (tci.hasCatchBlock) {
                    tci.catchBlockEmpty = tryStmt.getCatchClauses().stream()
                            .allMatch(cc -> cc.getBody().getStatements().isEmpty());
                } else {
                    tci.catchBlockEmpty = false;
                }

                output.tryCatchBlocks.add(tci);
            });

            // Extract string concatenations
            method.findAll(BinaryExpr.class).forEach(binaryExpr -> {
                if (binaryExpr.getOperator() == BinaryExpr.Operator.PLUS) {
                    // Check if either side is a string literal
                    boolean hasStringLiteral = binaryExpr.getLeft() instanceof StringLiteralExpr ||
                                              binaryExpr.getRight() instanceof StringLiteralExpr;

                    if (hasStringLiteral) {
                        StringConcatInfo sci = new StringConcatInfo();
                        sci.file = mi.file;
                        sci.methodId = mi.id;
                        sci.line = binaryExpr.getBegin().map(p -> p.line).orElse(-1);
                        sci.operator = "+";
                        sci.id = sci.file + "#" + sci.methodId + "@concat:" + sci.line;

                        // Check context: SQL keywords (only from actual string literals, not variable names)
                        sci.inSqlContext = false;
                        sci.inCommandContext = false;

                        // Check left side if it's a string literal
                        if (binaryExpr.getLeft() instanceof StringLiteralExpr) {
                            String leftLiteral = ((StringLiteralExpr) binaryExpr.getLeft()).getValue().toUpperCase();
                            sci.inSqlContext = sci.inSqlContext ||
                                              leftLiteral.contains("SELECT") || leftLiteral.contains("INSERT") ||
                                              leftLiteral.contains("UPDATE") || leftLiteral.contains("DELETE") ||
                                              leftLiteral.contains("FROM") || leftLiteral.contains("WHERE");

                            sci.inCommandContext = sci.inCommandContext ||
                                                  leftLiteral.contains("SH ") || leftLiteral.contains("BASH") ||
                                                  leftLiteral.contains("CMD") || leftLiteral.contains("EXEC") ||
                                                  leftLiteral.contains("/BIN/");
                        }

                        // Check right side if it's a string literal
                        if (binaryExpr.getRight() instanceof StringLiteralExpr) {
                            String rightLiteral = ((StringLiteralExpr) binaryExpr.getRight()).getValue().toUpperCase();
                            sci.inSqlContext = sci.inSqlContext ||
                                              rightLiteral.contains("SELECT") || rightLiteral.contains("INSERT") ||
                                              rightLiteral.contains("UPDATE") || rightLiteral.contains("DELETE") ||
                                              rightLiteral.contains("FROM") || rightLiteral.contains("WHERE");

                            sci.inCommandContext = sci.inCommandContext ||
                                                  rightLiteral.contains("SH ") || rightLiteral.contains("BASH") ||
                                                  rightLiteral.contains("CMD") || rightLiteral.contains("EXEC") ||
                                                  rightLiteral.contains("/BIN/");
                        }

                        output.stringConcats.add(sci);
                    }
                }
            });

            // Extract PreparedStatement usage
            boolean hasParameterSetter = method.findAll(MethodCallExpr.class).stream()
                    .anyMatch(Main::isPreparedStatementSetter);

            method.findAll(ObjectCreationExpr.class).forEach(objCreation -> {
                String typeName = objCreation.getType().getNameAsString();
                if (typeName.equals("PreparedStatement") || typeName.contains("PreparedStatement")) {
                    PreparedStatementInfo psi = new PreparedStatementInfo();
                    psi.file = mi.file;
                    psi.methodId = mi.id;
                    psi.line = objCreation.getBegin().map(p -> p.line).orElse(-1);
                    psi.id = psi.file + "#" + psi.methodId + "@prepared:" + psi.line;
                    psi.usesPreparedStatement = true;
                    psi.usesParameterization = hasParameterSetter;

                    output.preparedStatements.add(psi);
                }
            });

            // Detect PreparedStatement method calls (prepareStatement)
            method.findAll(MethodCallExpr.class).forEach(call -> {
                if (call.getNameAsString().equals("prepareStatement")) {
                    PreparedStatementInfo psi = new PreparedStatementInfo();
                    psi.file = mi.file;
                    psi.methodId = mi.id;
                    psi.line = call.getBegin().map(p -> p.line).orElse(-1);
                    psi.id = psi.file + "#" + psi.methodId + "@prepared:" + psi.line;
                    psi.usesPreparedStatement = true;

                    // Check if there are ? placeholders in the query
                    if (!call.getArguments().isEmpty()) {
                        String query = call.getArgument(0).toString();
                        psi.usesParameterization = query.contains("?");
                    }
                    psi.usesParameterization = psi.usesParameterization || hasParameterSetter;

                    output.preparedStatements.add(psi);
                }
            });

            // Extract suppression comments
            // Check method comments
            if (method.getComment().isPresent()) {
                Comment methodComment = method.getComment().get();
                String text = methodComment.getContent().trim();
                parseSuppression(text, methodComment.getBegin().map(p -> p.line).orElse(-1), mi.file, output);
            }

            // Check all statements for line comments
            method.findAll(com.github.javaparser.ast.stmt.Statement.class).forEach(stmt -> {
                if (stmt.getComment().isPresent()) {
                    Comment stmtComment = stmt.getComment().get();
                    String text = stmtComment.getContent().trim();
                    parseSuppression(text, stmtComment.getBegin().map(p -> p.line).orElse(-1), mi.file, output);
                }
            });

            var classDeclOpt = method.findAncestor(ClassOrInterfaceDeclaration.class);
            if (classDeclOpt.isPresent()) {
                var classDecl = classDeclOpt.get();
                String stereotype = detectStereotype(classDecl);

                if (stereotype.equals("RestController") || stereotype.equals("Controller")) {
                    Optional<String> httpMethod = detectHttpMethod(method);
                    if (httpMethod.isPresent()) {
                        String classPath = getClassLevelPath(classDecl);
                        String methodPath = getMethodLevelPath(method);

                        RouteInfo ri = new RouteInfo();
                        ri.file = mi.file;
                        ri.className = className;
                        ri.methodName = methodName;
                        ri.httpMethod = httpMethod.get();
                        ri.fullPath = joinPaths(classPath, methodPath);
                        ri.line = line;
                        ri.id = ri.file + "#" + ri.className + "." + ri.methodName + ":" + ri.httpMethod + " " + ri.fullPath;

                        output.routes.add(ri);
                    }
                }
            }
        });
    }

    private static String detectStereotype(ClassOrInterfaceDeclaration cls) {
        if (hasAnnotation(cls, "RestController")) return "RestController";
        if (hasAnnotation(cls, "Controller")) return "Controller";
        if (hasAnnotation(cls, "Service")) return "Service";
        if (hasAnnotation(cls, "Repository")) return "Repository";
        if (hasAnnotation(cls, "Component")) return "Component";
        return "Unknown";
    }

    private static boolean hasAnnotation(NodeWithAnnotations<?> node, String simpleName) {
        return node.getAnnotations().stream()
                .anyMatch(a -> a.getNameAsString().equals(simpleName));
    }

    private static boolean isPreparedStatementSetter(MethodCallExpr call) {
        return call.getNameAsString().equals("setString") ||
                call.getNameAsString().equals("setInt") ||
                call.getNameAsString().equals("setLong") ||
                call.getNameAsString().equals("setBoolean") ||
                call.getNameAsString().equals("setDate");
    }

    private static void parseSuppression(String text, int line, String file, Output output) {
        if (text.contains("analyzer-ignore") || text.contains("@suppress")) {
            SuppressionInfo si = new SuppressionInfo();
            si.file = file;
            si.line = line;

            // Parse rule ID from comment
            // Format: // analyzer-ignore SEC-001
            // Format: // @suppress BUG-002 reason
            if (text.contains("analyzer-ignore")) {
                String[] parts = text.split("analyzer-ignore");
                if (parts.length > 1) {
                    String[] tokens = parts[1].trim().split("\\s+");
                    if (tokens.length > 0) {
                        si.ruleId = tokens[0];
                        if (tokens.length > 1) {
                            si.reason = String.join(" ", java.util.Arrays.copyOfRange(tokens, 1, tokens.length));
                        }
                    }
                }
            } else if (text.contains("@suppress")) {
                String[] parts = text.split("@suppress");
                if (parts.length > 1) {
                    String[] tokens = parts[1].trim().split("\\s+");
                    if (tokens.length > 0) {
                        si.ruleId = tokens[0];
                        if (tokens.length > 1) {
                            si.reason = String.join(" ", java.util.Arrays.copyOfRange(tokens, 1, tokens.length));
                        }
                    }
                }
            }

            if (si.ruleId != null && !si.ruleId.isEmpty()) {
                output.suppressions.add(si);
            }
        }
    }

    private static String getClassLevelPath(ClassOrInterfaceDeclaration cls) {
        return cls.getAnnotationByName("RequestMapping")
                .map(Main::extractPathFromAnnotation)
                .orElse("");
    }

    private static Optional<String> detectHttpMethod(MethodDeclaration method) {
        if (method.getAnnotationByName("GetMapping").isPresent()) return Optional.of("GET");
        if (method.getAnnotationByName("PostMapping").isPresent()) return Optional.of("POST");
        if (method.getAnnotationByName("PutMapping").isPresent()) return Optional.of("PUT");
        if (method.getAnnotationByName("DeleteMapping").isPresent()) return Optional.of("DELETE");
        if (method.getAnnotationByName("PatchMapping").isPresent()) return Optional.of("PATCH");
        if (method.getAnnotationByName("RequestMapping").isPresent()) return Optional.of("REQUEST");
        return Optional.empty();
    }

    private static String getMethodLevelPath(MethodDeclaration method) {
        for (String ann : List.of("GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping", "RequestMapping")) {
            var a = method.getAnnotationByName(ann);
            if (a.isPresent()) {
                return extractPathFromAnnotation(a.get());
            }
        }
        return "";
    }

    private static String extractPathFromAnnotation(AnnotationExpr annotation) {
        if (annotation.isSingleMemberAnnotationExpr()) {
            return stripQuotes(annotation.asSingleMemberAnnotationExpr().getMemberValue().toString());
        }

        if (annotation.isNormalAnnotationExpr()) {
            var pairs = annotation.asNormalAnnotationExpr().getPairs();
            for (var p : pairs) {
                if (p.getNameAsString().equals("value") || p.getNameAsString().equals("path")) {
                    return stripQuotes(p.getValue().toString());
                }
            }
        }

        return "";
    }

    private static String stripQuotes(String s) {
        if (s == null) return "";
        return s.replaceAll("^\\\"|\\\"$", "");
    }

    private static String joinPaths(String a, String b) {
        String left = a == null ? "" : a.trim();
        String right = b == null ? "" : b.trim();

        if (left.isEmpty()) return normalizePathPart(right);
        if (right.isEmpty()) return normalizePathPart(left);

        return normalizePathPart(left + "/" + right);
    }

    private static String normalizePathPart(String s) {
        String x = s.replaceAll("//+", "/");
        if (!x.startsWith("/")) x = "/" + x;
        return x.replaceAll("/+$", "");
    }

    private static String relativize(String root, String fullPath) {
        return Paths.get(root).toAbsolutePath().normalize()
                .relativize(Paths.get(fullPath).toAbsolutePath().normalize())
                .toString()
                .replace("\\\\", "/");
    }
}
